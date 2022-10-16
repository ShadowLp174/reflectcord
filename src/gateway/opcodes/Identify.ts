/* eslint-disable no-plusplus */
import { GatewayCloseCodes } from "discord.js";
import { API } from "revolt-api";
import { startListener } from "../util/Listener";
import { Payload } from "../util";
import { WebSocket } from "../Socket";

export async function onIdentify(this: WebSocket, data: Payload) {
  clearTimeout(this.readyTimeout);

  console.log("Identifying");

  const identify = data.d;

  const { token } = identify;

  if (!token) {
    console.error(`Invalid token ${token}`);
    return this.close(GatewayCloseCodes.AuthenticationFailed);
  }

  this.rvAPI = new API({
    authentication: {
      revolt: {
        token,
      },
    },
  });

  await startListener.call(this, token);

  await this.rvClient.loginBot(token).catch(() => {
    console.error("Revolt failed authentication");
    return this.close(GatewayCloseCodes.AuthenticationFailed);
  });
}
