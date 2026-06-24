import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import {
  successEmbed,
  errorEmbed,
  warningEmbed,
} from '../../utils/embeds.js';

import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption(o =>
      o.setName("target")
        .setRequired(true)
        .setDescription("User to warn")
    )
    .addStringOption(o =>
      o.setName("reason")
        .setRequired(true)
        .setDescription("Reason for the warning")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  category: "moderation",

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const target = interaction.options.getUser("target");
      const member = interaction.options.getMember("target");
      const reason = interaction.options.getString("reason");
      const moderator = interaction.user;

      if (!target || !member) {
        throw new TitanBotError(
          "Invalid target",
          ErrorTypes.USER_INPUT,
          "That user is not in this server."
        );
      }

      const hierarchyCheck = ModerationService.validateHierarchy(
        interaction.member,
        member,
        'warn'
      );

      if (!hierarchyCheck.valid) {
        throw new TitanBotError(
          hierarchyCheck.error,
          ErrorTypes.PERMISSION,
          hierarchyCheck.error
        );
      }

      // =========================
      // ADD WARNING (SAPPHIRE STYLE)
      // =========================
      const result = await WarningService.addWarning({
        guildId: interaction.guildId,
        userId: target.id,
        moderatorId: moderator.id,
        reason,
        timestamp: Date.now()
      });

      if (!result.success) {
        throw new Error("Failed to store warning");
      }

      const totalWarns = result.totalCount;
      const caseId = result.id;

      // =========================
      // LOG MODERATION ACTION
      // =========================
      await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: "User Warned",
          target: `${target.tag} (${target.id})`,
          executor: `${moderator.tag} (${moderator.id})`,
          reason,
          metadata: {
            warningId: caseId,
            warningNumber: totalWarns
          }
        }
      });

      // =========================
      // SAPPHIRE-STYLE RESPONSE
      // =========================
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          warningEmbed(
            `⚠️ Case #${caseId}`,
            [
              `**User:** ${target.tag}`,
              `**Reason:** ${reason}`,
              `**Moderator:** ${moderator.tag}`,
              `**Total Warnings:** ${totalWarns}`
            ].join("\n")
          )
        ]
      });

    } catch (error) {
      logger.error('Warn command error:', error);
      await handleInteractionError(interaction, error, {
        subtype: 'warn_failed'
      });
    }
  }
};
