import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';

import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { ModerationService } from '../../services/moderationService.js';
import {
  handleInteractionError,
  TitanBotError,
  ErrorTypes,
} from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CHECK_EMOJI = '<a:checkmark:1519197302747824309>';
const LOADING_EMOJI = '<a:sapphireload:1519198982293946424>';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(o =>
      o
        .setName('target')
        .setRequired(true)
        .setDescription('User to warn')
    )
    .addStringOption(o =>
      o
        .setName('reason')
        .setRequired(true)
        .setDescription('Reason for the warning')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  category: 'moderation',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    let replyMessage;

    try {
      replyMessage = await interaction.fetchReply();
      await replyMessage.react(LOADING_EMOJI);

      const target = interaction.options.getUser('target');
      const member = interaction.options.getMember('target');
      const reason = interaction.options.getString('reason');
      const moderator = interaction.user;

      if (!target || !member) {
        throw new TitanBotError(
          'Invalid target',
          ErrorTypes.USER_INPUT,
          'That user is not in this server.'
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

      const result = await WarningService.addWarning({
        guildId: interaction.guildId,
        userId: target.id,
        moderatorId: moderator.id,
        reason,
        timestamp: Date.now(),
      });

      if (!result.success) {
        throw new Error('Failed to store warning');
      }

      const totalWarns = result.totalCount;
      const caseId = result.id;

      await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: 'User Warned',
          target: `${target.tag} (${target.id})`,
          executor: `${moderator.tag} (${moderator.id})`,
          reason,
          metadata: {
            warningId: caseId,
            warningNumber: totalWarns,
          },
        },
      });

      try {
        const loadingReaction = replyMessage.reactions.cache.find(
          r => r.emoji.toString() === LOADING_EMOJI
        );
        if (loadingReaction) {
          await loadingReaction.users.remove(client.user.id);
        }
      } catch {}

      const successEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(
          `${CHECK_EMOJI} <@${target.id}> warned\n` +
          `**Reason:** ${reason}\n` +
          `**Duration:** Permanent`
        )
        .setTimestamp();

      await InteractionHelper.safeEditReply(interaction, {
        content: null,
        embeds: [successEmbed],
      });
    } catch (error) {
      logger.error('Warn command error:', error);

      try {
        if (replyMessage) {
          const loadingReaction = replyMessage.reactions.cache.find(
            r => r.emoji.toString() === LOADING_EMOJI
          );
          if (loadingReaction) {
            await loadingReaction.users.remove(client.user.id);
          }
        }
      } catch {}

      await handleInteractionError(interaction, error, {
        subtype: 'warn_failed',
      });
    }
  },
};
