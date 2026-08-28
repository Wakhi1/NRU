// Account & security — read-only here by design. FLMS holds no local password and no local
// authenticator-app/email-OTP state for anyone, the same "one database records enrollment" decision
// SPTS makes. Enrollment, disabling, backup codes, and password changes all happen in the HRIS
// itself and simply take effect here — this page just shows what's currently true there.
(async () => {
  await Shell.init('account');
  document.getElementById('main').innerHTML = `
    <div class="page-head"><div><h1>Account &amp; security</h1>
      <p class="page-sub">Sign-in, password and second-factor are all managed by the HRIS — the single account behind every system in the ecosystem.</p></div></div>
    <div class="card" id="status-box"><p class="muted">Loading…</p></div>`;

  const box = document.getElementById('status-box');
  try {
    const { data } = await Api.get('/mfa/status');
    box.innerHTML = `
      <div class="row" style="margin-bottom:14px;"><span class="badge badge-info">Managed by HRIS</span></div>
      <div class="grid grid-2">
        <div>
          <h3 style="margin-top:0;">Authenticator app</h3>
          <p class="muted">${data.totp_enabled ? 'Enrolled — used automatically when you sign in here.' : 'Not enrolled.'}</p>
        </div>
        <div>
          <h3 style="margin-top:0;">Email code sign-in</h3>
          <p class="muted">${data.email_otp_enabled ? 'Enrolled — used automatically when you sign in here.' : 'Not enrolled.'}</p>
        </div>
      </div>
      <p class="field-hint" style="margin-top:14px;">To enrol, disable, regenerate backup codes, or change your password, use the HRIS's own Account &amp; security page — changes there apply here immediately, with nothing to set up twice.</p>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">No HRIS login is on file for your account, so there's nothing to manage here yet — you signed in through a different path than the HRIS. Contact IT if this looks wrong.</p>`;
  }
})();
