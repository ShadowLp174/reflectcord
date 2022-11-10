import { API, Server, Options } from "revolt-api";

type apiCall = {
  serverId: string,
  callback: Function
};

export class rvAPI extends API {
  serverMap: Map<string, Server>;

  lastRequest: number;
  minInterval: number;
  requestQueue: Array<apiCall>;

  constructor(config?: Partial<Options>) {
    super(config); // normal api object

    this.serverMap = new Map();

    this.lastRequest = Date.now();
    this.minInterval = (10/5.5) * 1000; // 5 requests per 10 seconds
    this.requestQueue = [];
  }
  async wait(ms: number): Promise<void> {
    return new Promise(res => {
      setTimeout(res, ms);
    });
  }
  run(data?: apiCall): void {
    if (this.requestQueue.length > 0) {
      if (data) {
        this.requestQueue.push(data);
        return;
      }
    } else if (data) {
      this.requestQueue.push(data);
      this.run();
      return;
    }
    let interval = Date.now() - this.lastRequest;
    let diff = interval - this.minInterval;
    diff = (diff < 0) ? interval : 0;

    var call = () => {
      let curr = this.requestQueue.splice(0, 1)[0];
      if (!curr) return;
      let serverId = curr.serverId;
      let cb = curr.callback;
      if (this.serverMap.has(serverId)) {
        cb(this.serverMap.get(serverId));
        this.run();
        return;
      }
      this.get(`/servers/${serverId as ""}`).then(server => {
        this.lastRequest = Date.now();
        this.run();
        if (!server) return cb(null);
        this.serverMap.set(serverId, server);
        cb(server);
      }).catch((e) => {
        console.log("Revolt API Error (rvAPI.ts; run->call): ", e.response.code);
        cb(null);
        throw "Stop";
        //this.run();
      });
    }

    if (diff == 0) {
      call();
    } else {
      setTimeout(call, diff);
    }
  }
  async getServer(serverId: string): Promise<Server | null> {
    return new Promise(async (res, _rej) => {
      if (this.serverMap.has(serverId)) return res(this.serverMap.get(serverId) as Server);
      this.run({ serverId, callback: res });
    });
  }
}
