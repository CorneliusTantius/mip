// Where the dashboard server listens. Only loopback, so the dashboard isn't reachable from the network.
export const HOST = "127.0.0.1";
export const PORT = Number(process.env.MIP_PORT ?? 3000);
