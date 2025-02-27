/* eslint-disable no-plusplus */
import { GatewayDispatchEvents, GatewayOpcodes } from "discord.js";
import { setHeartbeat } from "../util/Heartbeat";
import { Send, Payload } from "../util";
import { WebSocket } from "../Socket";
import { Logger } from "../../common/utils";

export async function QueryApplicationCommands(this: WebSocket, data: Payload) {
  const appData = data.d;

  Logger.warn(`Stub! ${appData}`);

  await Send(this, {
    op: GatewayOpcodes.Dispatch,
    t: "GUILD_APPLICATION_COMMANDS_UPDATE",
    s: this.sequence++,
    d: {
      updated_at: 1630271377245,
      nonce: appData["nonce"] ?? "",
      guild_id: appData["guild_id"] ?? "",
      applications: [],
      application_commands: [],
    },
  });
}
