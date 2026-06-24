import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName("roleinfo")
    .setDescription("Get detailed information about a role")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Role mention, ID, or role name")
        .setRequired(true),
    ),

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction);
      if (!deferSuccess) {
        logger.warn(`RoleInfo interaction defer failed`, {
          userId: interaction.user.id,
          guildId: interaction.guildId,
          commandName: 'roleinfo',
        });
        return;
      }

      const query = interaction.options.getString("query").trim();
      const guild = interaction.guild;

      let role =
        interaction.options.getRole("role") ||
        guild.roles.cache.get(query.replace(/[<@&>]/g, "")) ||
        guild.roles.cache.find((r) => r.name.toLowerCase() === query.toLowerCase());

      if (!role) {
        const cleanId = query.replace(/[<@&>]/g, "");
        if (/^\d+$/.test(cleanId)) {
          role = await guild.roles.fetch(cleanId).catch(() => null);
        }
      }

      if (!role) {
        const matches = guild.roles.cache.filter(
          (r) => r.name.toLowerCase() === query.toLowerCase()
        );

        if (matches.size > 1) {
          const sameNames = matches
            .map((r) => `${r.name} (${r.id})`)
            .join("\n");

          return InteractionHelper.safeEditReply(interaction, {
            content: `Which role did you mean?\n${sameNames}`,
            embeds: [],
          });
        }

        return InteractionHelper.safeEditReply(interaction, {
          content: `I couldn't find a role for: ${query}`,
          embeds: [],
        });
      }

      await guild.members.fetch();

      const membersWithRole = guild.members.cache.filter((member) =>
        member.roles.cache.has(role.id)
      ).size;

      const permissions = role.permissions.toArray();
      const permsValue = permissions.length
        ? permissions.map((p) => `\`${p}\``).join(", ")
        : "None";

      const createdTimestamp = role.createdAt
        ? Math.floor(role.createdAt.getTime() / 1000)
        : null;

      const embed = createEmbed({ title: `Role Info: ${role.name}` })
        .setColor(role.color || null)
        .addFields(
          { name: "ID", value: role.id, inline: true },
          { name: "Mention", value: role.toString(), inline: true },
          { name: "Position", value: String(role.position), inline: true },
          { name: "Members", value: String(membersWithRole), inline: true },
          { name: "Hoist", value: role.hoist ? "Yes" : "No", inline: true },
          { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
          { name: "Managed", value: role.managed ? "Yes" : "No", inline: true },
          { name: "Color", value: role.hexColor || "Default", inline: true },
          { name: "Permissions", value: permsValue.slice(0, 1024), inline: false },
          {
            name: "Created",
            value: createdTimestamp ? `<t:${createdTimestamp}:R>` : "Unknown",
            inline: true,
          },
        );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

      logger.info(`RoleInfo command executed`, {
        userId: interaction.user.id,
        roleId: role.id,
        guildId: interaction.guildId,
      });
    } catch (error) {
      logger.error(`RoleInfo command execution failed`, {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'roleinfo',
      });

      await handleInteractionError(interaction, error, {
        commandName: 'roleinfo',
        source: 'roleinfo_command',
      });
    }
  },
};
