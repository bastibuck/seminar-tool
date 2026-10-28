"use client";

import { announceSessionChange, browserSessionKey } from "../instructor-identity";

export function SignInForm({ next }: { next: string }) {
  return <form className="surface form-card start-case-form" action="/api/instructor/sign-in" method="post" onSubmit={() => {
    // The response may install a different shared cookie, including when it
    // redirects to password setup or a public page. Lock old tabs first.
    announceSessionChange(browserSessionKey());
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("instructor-identity");
      channel.postMessage({ sessionKey: null });
      channel.close();
    }
  }}>
    <input type="hidden" name="next" value={next} />
    <div className="start-case-form__field">
      <label htmlFor="email">E-Mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
    </div>
    <div className="start-case-form__field">
      <label htmlFor="password">Passwort</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
    </div>
    <button className="button start-case-form__submit" type="submit">Anmelden</button>
  </form>;
}
