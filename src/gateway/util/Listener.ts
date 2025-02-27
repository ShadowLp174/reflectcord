/* eslint-disable camelcase */
/* eslint-disable no-param-reassign */
/* eslint-disable no-plusplus */
import {
  GatewayCloseCodes, GatewayDispatchEvents, GatewayOpcodes,
} from "discord.js";
import { API } from "revolt.js";
import { APIWrapper, createAPI } from "../../common/rvapi";
import {
  Channel, Emoji, Guild, Member, Message, PartialEmoji, Relationship, selfUser, User,
} from "../../common/models";
import { WebSocket } from "../Socket";
import { Send } from "./send";
import experiments from "./experiments.json";
import { toSnowflake } from "../../common/models/util";
import { Logger } from "../../common/utils";
import { userStartTyping } from "../../common/events";
import { RabbitMQ } from "../../common/utils/RabbitMQ";

export async function startListener(this: WebSocket, token: string) {
  this.rvClient.on("packet", async (data) => {
    try {
      switch (data.type) {
        case "Ready": {
          const currentUser = data.users.find((x) => x.relationship === "User");
          if (!currentUser) return this.close(GatewayCloseCodes.AuthenticationFailed);

          if (currentUser.bot) {
            this.rvAPI = createAPI(token);
          } else {
            this.rvAPI = createAPI({
              token,
            });
          }
          // HACK! Fixes #10
          this.rvClient.api = this.rvAPI;
          this.rvAPIWrapper = new APIWrapper(this.rvAPI);

          this.typingConsumer = await RabbitMQ.channel?.consume(userStartTyping, (msg) => {
            if (!msg) return;

            const { channel, token: userToken } = JSON.parse(msg.content.toString());

            if (userToken === token) {
              this.rvClient.websocket.send({
                type: "BeginTyping",
                channel,
              });

              Logger.log(`started typing in ${channel}`);
            }
          }, { noAck: true });

          const users = await Promise.all(data.users
            .map(async (user) => this.rvAPIWrapper.users.createObj({
              revolt: user,
              discord: await User.from_quark(user),
            }).discord));

          await Promise.all(data.channels
            .map(async (channel) => this.rvAPIWrapper.channels.createObj({
              revolt: channel,
              discord: await Channel.from_quark(channel, { excludedUser: currentUser._id }),
            })));

          const channels = (await Promise.all(data.channels
            .map(async (channel) => this.rvAPIWrapper.channels.createObj({
              revolt: channel,
              discord: await Channel.from_quark(channel, { excludedUser: currentUser._id }),
            })))).filter((channel) => (
            channel.revolt.channel_type === "DirectMessage"
              || channel.revolt.channel_type === "Group"
          )).map((x) => x.discord);

          const guilds = await Promise.all(data.servers
            .map(async (server) => {
              const rvChannels: API.Channel[] = server.channels
                .map((x) => this.rvAPIWrapper.channels.$get(x)?.revolt).filter((x) => x);

              const guild = {
                ...await Guild.from_quark(server),
                channels: await Promise.all(rvChannels.map((x) => Channel.from_quark(x))),
              };

              // Bots don't get sent full guilds in actual discord.
              if (currentUser.bot) {
                setTimeout(() => {
                  Send(this, {
                    op: GatewayOpcodes.Dispatch,
                    t: GatewayDispatchEvents.GuildCreate,
                    s: this.sequence++,
                    d: guild,
                  });
                }, 500);
                return { id: guild.id, unavailable: true };
              }

              return guild;
            }));

          const mfaInfo = !currentUser.bot ? await this.rvAPI.get("/auth/mfa/") : null;
          const authInfo = !currentUser.bot ? await this.rvAPI.get("/auth/account/") : null;
          const currentUserDiscord = await selfUser.from_quark({
            user: currentUser,
            authInfo: authInfo ?? {
              _id: currentUser._id,
              email: "fixme@gmail.com",
            },
            mfaInfo,
          });

          const members = await Promise.all(data.members.map((x) => Member.from_quark(x)));

          const mergedMembers = members.map((member) => [{
            ...member,
            roles: member.roles,
            settings: undefined,
            guild: undefined,
          }]);

          const relationships = await Promise.all(data.users
            .filter((u) => u.relationship !== "None" && u.relationship !== "User")
            .map(async (u) => ({
              type: await Relationship.from_quark(u.relationship ?? "Friend"),
              user: await User.from_quark(u),
            })));

          const readyData = {
            v: 8,
            application: currentUserDiscord.bot ? {
              id: currentUserDiscord.id,
              flags: 0,
            } : {
              id: "",
              flags: 0,
            },
            user: currentUserDiscord,
            user_settings: {},
            guilds,
            guild_experiments: [],
            geo_ordered_rtc_regions: [],
            relationships: relationships.map((x) => ({
              id: x.user.id,
              type: x.type,
              nickname: x.user.username,
              user: x.user,
            })),
            read_state: {
              entries: [],
              partial: false,
              version: 304128,
            },
            user_guild_settings: {
              entries: [],
              partial: false,
              version: 642,
            },
            users,
            experiments, // ily fosscord
            private_channels: channels,
            session_id: this.rvClient.session,
            friend_suggestion_count: 0,
            guild_join_requests: [],
            connected_accounts: [],
            analytics_token: "",
            consents: {
              personalization: {
                consented: false, // never gonna fix this lol
              },
            },
            country_code: "US",
            merged_members: mergedMembers,
          };

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.Ready,
            s: this.sequence++,
            d: readyData,
          });

          break;
        }
        case "Message": {
          const msgObj = await this.rvAPIWrapper.messages.convertMessageObj(data);
          const channel = await this.rvAPIWrapper.channels.fetch(data.channel);

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.MessageCreate,
            s: this.sequence++,
            d: {
              ...msgObj.discord,
              guild_id: channel?.discord && ("guild_id" in channel.discord) ? channel?.discord.guild_id : null,
            },
          });

          break;
        }
        case "MessageUpdate": {
          const msgObj = await this.rvAPIWrapper.messages.getMessage(data.channel, data.id);
          const channel = await this.rvAPIWrapper.channels.fetch(data.channel);

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.MessageUpdate,
            s: this.sequence++,
            d: {
              ...msgObj.discord,
              guild_id: ("guild_id" in channel.discord) ? channel.discord.guild_id : null,
            },
          });
          break;
        }
        case "MessageDelete": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.MessageDelete,
            s: this.sequence++,
            d: {
              id: await toSnowflake(data.id),
              channel_id: await toSnowflake(data.channel),
            // guild_id: null, // FIXME
            },
          });
          break;
        }
        case "MessageReact": {
          const emoji = await this.rvAPI.get(`/custom/emoji/${encodeURI(data.emoji_id)}`) as API.Emoji;
          if (!emoji) return;

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.MessageReactionAdd,
            s: this.sequence++,
            d: {
              user_id: await toSnowflake(data.user_id),
              channel_id: await toSnowflake(data.channel_id),
              message_id: await toSnowflake(data.id),
              emoji: await PartialEmoji.from_quark(emoji),
            },
          });
          break;
        }
        case "MessageUnreact": {
          const emoji = await this.rvAPI.get(`/custom/emoji/${encodeURI(data.emoji_id) as ""}`);
          if (!emoji) return;

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.MessageReactionRemove,
            s: this.sequence++,
            d: {
              user_id: await toSnowflake(data.user_id),
              channel_id: await toSnowflake(data.channel_id),
              message_id: await toSnowflake(data.id),
              emoji: await PartialEmoji.from_quark(emoji),
            },
          });
          break;
        }
        case "MessageRemoveReaction": {
          const emoji = await this.rvAPI.get(`/custom/emoji/${encodeURI(data.emoji_id) as ""}`);
          if (!emoji) return;

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.MessageReactionRemoveEmoji,
            s: this.sequence++,
            d: {
              channel_id: await toSnowflake(data.channel_id),
              message_id: await toSnowflake(data.id),
              emoji: await PartialEmoji.from_quark(emoji),
            },
          });
          break;
        }
        case "BulkMessageDelete": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.MessageDeleteBulk,
            s: this.sequence++,
            d: {
              ids: await Promise.all(data.ids.map((x) => toSnowflake(x))),
              channel_id: await toSnowflake(data.channel),
              // guild_id: null, //FIXME
            },
          });

          break;
        }
        case "ChannelStartTyping": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.TypingStart,
            s: this.sequence++,
            d: {
              channel_id: await toSnowflake(data.id),
              user_id: await toSnowflake(data.user),
              timestamp: Date.now().toString(),
            },
          });
          break;
        }
        case "ChannelCreate": {
          const channel = this.rvAPIWrapper.channels.createObj({
            revolt: data,
            discord: await Channel.from_quark(data),
          });

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.ChannelCreate,
            s: this.sequence++,
            d: channel.discord,
          });
          break;
        }
        case "ChannelUpdate": {
          const channel = this.rvAPIWrapper.channels.$get(data.id, {
            revolt: data.data ?? {},
            discord: {},
          });

          if (!channel.revolt) return;

          const channelDiscord = await Channel.from_quark(channel.revolt);
          const updatedChannel = this.rvAPIWrapper.channels.$get(data.id, {
            revolt: {},
            discord: channelDiscord,
          });

          /**
           * FIXME: wrappers using buggy encodings (ERLPACK) don't like properties being null
           * but having a key, so we just delete it. It ONLY affects this property for
           * some reason even though we literally always give [] if you look in quarkconversion.
          */
          // @ts-expect-error
          delete updatedChannel.discord.permission_overwrites;

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.ChannelUpdate,
            s: this.sequence++,
            d: updatedChannel.discord,
          });

          break;
        }
        case "ChannelDelete": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.ChannelDelete,
            s: this.sequence++,
            d: await Channel.from_quark({
              _id: data.id,
              channel_type: "DirectMessage",
              active: false,
              recipients: [],
            }),
          });
          break;
        }
        case "ServerCreate": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.GuildCreate,
            s: this.sequence++,
            d: await Guild.from_quark(data.server),
          });
          break;
        }
        case "ServerDelete": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.GuildDelete,
            s: this.sequence++,
            d: {
              id: await toSnowflake(data.id),
              unavailable: true,
            },
          });
          break;
        }
        case "ServerMemberJoin": {
          const member = await this.rvAPI.get(`/servers/${data.id}/members/${data.user}`) as API.Member;

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.GuildMemberAdd,
            s: this.sequence++,
            d: {
              ...await Member.from_quark(member),
              guild_id: await toSnowflake(data.id),
            },
          });

          break;
        }
        case "ServerMemberUpdate": {
          const { nickname, joined_at, timeout } = data.data;

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.GuildMemberUpdate,
            s: this.sequence++,
            d: {
              guild_id: await toSnowflake(data.id.server),
              roles: data.data.roles?.map((x) => toSnowflake(x)) ?? [],
              user: await User.from_quark({
                ...data.data,
                _id: data.id.user,
                username: nickname ?? "fixme",
              }),
              nick: nickname,
              joined_at: joined_at ? new Date(joined_at).toISOString() : undefined,
              avatar: data.data.avatar?._id,
              communication_disabled_until: timeout ? new Date(timeout).toISOString() : undefined,
            },
          });

          break;
        }
        case "ServerMemberLeave": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.GuildMemberRemove,
            s: this.sequence++,
            d: {
              guild_id: await toSnowflake(data.id),
              user: await toSnowflake(data.user),
            },
          });

          break;
        }
        case "ChannelStopTyping": {
        // Discord wont handle this no matter what
          break;
        }
        case "UserUpdate": {
          /*
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.UserUpdate,
            s: this.sequence++,
            d: await User.from_quark({
              _id: data.id,
              username: data.data.username ?? "fixme",
              flags: data.data.flags ?? null,
            }),
          });
          */
          break;
        }
        case "ChannelAck": {
          const msg = this.rvClient.messages.get(data.message_id);

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: "MESSAGE_ACK",
            s: this.sequence++,
            d: {
              channel_id: msg?.channel_id ? await toSnowflake(msg?.channel_id) : undefined,
              message_id: await toSnowflake(data.message_id),
              version: 3763,
            },
          });
          break;
        }
        case "EmojiCreate": {
          if (data.parent.type !== "Server") return;

          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.GuildEmojisUpdate,
            s: this.sequence++,
            d: {
              guild_id: await toSnowflake(data.parent.id),
              emojis: [await Emoji.from_quark(data)],
            },
          });

          break;
        }
        case "ServerRoleDelete": {
          await Send(this, {
            op: GatewayOpcodes.Dispatch,
            t: GatewayDispatchEvents.GuildRoleDelete,
            s: this.sequence++,
            d: {
              guild_id: await toSnowflake(data.id),
              role_id: await toSnowflake(data.role_id),
            },
          });

          break;
        }
        case "Pong": {
          break;
        }
        default: {
          Logger.warn(`Unknown event type ${data.type}`);
          break;
        }
      }
    } catch (e) {
      Logger.error(`Error during ws handle: ${e}`);
    }
  });
}
