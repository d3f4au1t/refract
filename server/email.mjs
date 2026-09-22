import { Resend } from 'resend';

export function verificationEmail(otp) {
  if (!/^\d{6}$/.test(otp)) throw new Error('Invalid verification code format.');
  return {
    subject: 'Your Refract verification code',
    text: `Your Refract verification code is ${otp}. It expires in 10 minutes.\n\nEnter it on the Refract registration page. Do not share this code. If you did not request it, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#101820"><table role="presentation" style="width:100%;padding:40px 18px"><tr><td align="center"><table role="presentation" style="max-width:480px;width:100%;background:#fff;border:1px solid #dce2e8;border-radius:12px;padding:36px"><tr><td><p style="font-size:12px;letter-spacing:4px;margin:0 0 32px">REFRACT</p><h1 style="font-size:25px;font-weight:500;line-height:1.3">Verify your email.</h1><p style="color:#526170;font-size:15px;line-height:1.8">Enter this code on the Refract registration page:</p><p style="font-size:36px;letter-spacing:8px;background:#f0f4f7;padding:22px 10px;text-align:center;border-radius:8px">${otp}</p><p style="color:#526170;font-size:14px;line-height:1.8">This code expires in 10 minutes. Don’t share it with anyone.</p><p style="color:#788491;font-size:12px;line-height:1.7;margin-top:28px">If you didn’t request this email, you can ignore it.</p></td></tr></table></td></tr></table></body></html>`,
  };
}

export function createEmailSender(config) {
  if (!config.resendKey || !config.sender) return null;
  const resend = new Resend(config.resendKey);
  return async ({ email, otp }) => {
    const { error } = await resend.emails.send({ from: config.sender, to: [email], ...verificationEmail(otp) });
    if (error) throw new Error('Email provider rejected the verification message.');
  };
}
