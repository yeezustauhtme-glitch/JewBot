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
    .addUserOption(option =>
      option
        .setName('target')
        .setRequired(true)
        .setDescription('User to warn'),
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setRequired(true)
        .setDescription('Reason for the warning'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  category: 'moderation',

  async execute(interaction, config, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    let replyMessage;

    try {
      replyMessage = await interaction.fetchReply();
      await replyMessage.react(LOADING_EMOJI);

      const target = interaction.options.getUser('target', true);
      const member = interaction.options.getMember('target');
      const reason = interaction.options.getString('reason', true);
      const moderator = interaction.user;

      if (!member) {
        throw new TitanBotError(
          'Invalid target',
          ErrorTypes.USER_INPUT,
          'That user is not in this server.',
        );
      }

      const hierarchyCheck = ModerationService.validateHierarchy(
        interaction.member,
        member,
        'warn',
      );

      if (!hierarchyCheck.valid) {
        throw new TitanBotError(
          hierarchyCheck.error,
          ErrorTypes.PERMISSION,
          hierarchyCheck.error,
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

      await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: 'User Warned',
          target: `${target.tag} (${target.id})`,
          executor: `${moderator.tag} (${moderator.id})`,
          reason,
          metadata: {
            warningId: result.id,
            warningNumber: result.totalCount,
          },
        },
      });

      const successEmbed = new EmbedBuilder()
        .setColor(0x77DD77)
        .setDescription(
          `${CHECK_EMOJI} **@${target.username}** warned\n` +
            `> **Reason:** ${reason}\n` +
            `> **Duration:** Permanent`,
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
            reaction => reaction.emoji.toString() === LOADING_EMOJI,
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
