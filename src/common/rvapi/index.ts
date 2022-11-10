import { Options } from "revolt-api";
import { rvAPI } from "../utils/rvAPI";
import dotenv from "dotenv";
import { revoltApiURL } from "../constants";

dotenv.config();

export const TestingToken = process.env["testToken"];

export function createAPI(token?: Options["authentication"]["revolt"]) {
  return new rvAPI({
    baseURL: revoltApiURL,
    authentication: {
      revolt: token,
    },
  });
}

export * from "./images";
export * from "./APIWrapper";
export * from "./users";
export * from "./discovery";
export * from "./gifbox";
