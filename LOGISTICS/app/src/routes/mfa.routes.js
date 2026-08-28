// Read-only proxy to the HRIS's MFA status — FLMS enrolls no one in anything, same principle as
// SPTS: a second enrollment surface is exactly the "many databases record enrollment for the same
// users" problem being eliminated, not a helpful fallback. An employee with no HRIS login has no
// MFA (and no login at all — see auth.routes.js) until IT gives them an HRIS account.
const express = require('express');
const { asyncHandler, notFound } = require('../platform/errors');
const { requireAuth } = require('../platform/auth');
const hris = require('../platform/hris');

const router = express.Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => {
  const status = await hris.getMfaStatus(req.session.user.employeeNo);
  if (!status) throw notFound('No HRIS login on file — MFA is managed entirely on the HRIS');
  res.json({
    data: {
      totp_enabled: !!status.totp_enabled,
      email_otp_enabled: !!status.email_otp_enabled,
      managed_by_hris: true,
    },
  });
}));

module.exports = router;
