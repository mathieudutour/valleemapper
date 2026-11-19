import { DurableObject } from "cloudflare:workers";
import { api } from "../server/api";

interface Env {
  ASSETS: Fetcher;
  ROUTER: DurableObjectNamespace<MotisRouter>;
}
// A single shared router: per-user instances would duplicate the whole graph.
export class MotisRouter extends DurableObject<Env> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        ctx.container!.setInactivityTimeout(10 * 60 * 1000),
      );
      this.observe();
    }
  }
  private observe() {
    if (this.monitoring) return;
    this.monitoring = this.ctx
      .container!.monitor()
      .catch((e) => console.error("MOTIS container exited", e))
      .finally(() => {
        this.monitoring = undefined;
      });
    this.ctx.waitUntil(this.monitoring);
  }
  private async ready() {
    const c = this.ctx.container!;
    if (!c.running)
      c.start({
        image: c.images.base,
        instance: "standard-2",
        enableInternet: true,
      });
    this.observe();
    await c.setInactivityTimeout(10 * 60 * 1000);
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        const r = await c
          .getTcpPort(8080)
          .fetch("http://container/api/v1/geocode?text=Chedde&numResults=1", {
            signal: AbortSignal.timeout(1000),
          });
        await r.body?.cancel();
        if (r.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error("MOTIS startup timed out");
  }
  async fetch(request: Request) {
    this.starting ??= this.ready().finally(() => {
      this.starting = undefined;
    });
    await this.starting;
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return this.ctx.container!.getTcpPort(8080).fetch(forwarded);
  }
}
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/"))
      return api(request, {
        motis: (path, signal) =>
          env.ROUTER.getByName("mont-blanc").fetch(
            new Request("http://motis" + path, { signal }),
          ),
      });
    return env.ASSETS.fetch(request);
  },
};
