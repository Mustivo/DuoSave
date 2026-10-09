import nodemailer from 'nodemailer';

const user = process.env.GMAIL_USER || process.env.SMTP_USER;
const pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

export function getTransporter() {
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

/** Sends login credentials to the newly created partner */
export async function sendPartnerCredentialsEmail(params: {
  to: string;
  name: string;
  password: string;
  adminName?: string;
}) {
  const { to, name, password, adminName = 'Steven' } = params;
  const transporter = getTransporter();

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 22px;">Welcome to DuoSave! 👋</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5; margin: 0;">
          Hi <strong>${name}</strong>, your partner <strong>${adminName}</strong> has created your account on <strong>DuoSave</strong>.
        </p>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Your Login Credentials</p>
        <p style="margin: 0 0 8px 0; font-size: 15px; color: #1e293b;"><strong>Email:</strong> <span style="color: #0284c7;">${to}</span></p>
        <p style="margin: 0; font-size: 15px; color: #1e293b;"><strong>Password:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 3px 8px; border-radius: 6px; font-weight: 700; color: #0f172a;">${password}</span></p>
      </div>

      <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
        You can open the DuoSave app right now and log in directly with these credentials.
      </p>

      <div style="border-top: 1px solid #f1f5f9; padding-top: 16px;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          DuoSave • Save smarter, together. Built for two.
        </p>
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`[Mailer] GMAIL_USER or GMAIL_APP_PASSWORD not set in env. Credentials for ${to}: password=${password}`);
    return { sent: false, mock: true };
  }

  try {
    await transporter.sendMail({
      from: `"DuoSave" <${user}>`,
      to,
      subject: 'Welcome to DuoSave - Your Login Credentials',
      html,
    });
    console.log(`[Mailer] Credentials email successfully sent to ${to}`);
    return { sent: true };
  } catch (err: any) {
    console.warn(`[Mailer] Failed to send credentials email to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

/** Sends a verification OTP code for password reset */
export async function sendPasswordResetOtpEmail(params: {
  to: string;
  otp: string;
}) {
  const { to, otp } = params;
  const transporter = getTransporter();

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 22px;">Reset Your Password 🔐</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5; margin: 0;">
          We received a request to reset your DuoSave account password. Use the verification code below:
        </p>
      </div>

      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
        <p style="margin: 0 0 6px 0; font-size: 13px; color: #166534; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
        <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #15803d; font-family: monospace;">${otp}</span>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #166534;">Valid for 15 minutes</p>
      </div>

      <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">
        Enter this code into the DuoSave app to choose your new password. If you didn't request this, you can ignore this email.
      </p>

      <div style="border-top: 1px solid #f1f5f9; padding-top: 16px;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          DuoSave • Save smarter, together. Built for two.
        </p>
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`[Mailer] GMAIL_USER or GMAIL_APP_PASSWORD not set in env. Password Reset OTP for ${to}: ${otp}`);
    return { sent: false, mock: true };
  }

  try {
    await transporter.sendMail({
      from: `"DuoSave" <${user}>`,
      to,
      subject: `DuoSave Password Reset Code: ${otp}`,
      html,
    });
    console.log(`[Mailer] Reset OTP email successfully sent to ${to}`);
    return { sent: true };
  } catch (err: any) {
    console.warn(`[Mailer] Failed to send OTP email to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}
