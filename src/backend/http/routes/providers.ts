import type { SignInMethod } from "../../adapters/contract.js";
import { answerSignIn, listProviders, signIn, signOut } from "../../app/providers.js";
import { accepted, ack, notFound, ok, readJson } from "../respond.js";
import { get, post, type Route } from "../router.js";

// Providers: each one's sign-in targets, the models it offers, and any sign-in in progress.
export const providerRoutes: Route[] = [
  get("/api/providers", async () => ok({ providers: await listProviders() })),
  // One route for the three sign-in actions. Each target is a service inside a provider, such as the Claude subscription.
  post("/api/providers/:providerId/targets/:targetId/:action", async ({ req, params }) => {
    const body = await readJson(req);
    const { providerId, targetId } = params;
    switch (params.action) {
      case "sign-in":
        signIn(providerId, targetId, body.method as SignInMethod);
        return accepted({ started: true });
      case "answer":
        answerSignIn(providerId, targetId, String(body.answer ?? ""));
        return ack();
      case "sign-out":
        await signOut(providerId, targetId);
        return ack();
      default:
        return notFound();
    }
  }),
];
