import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password (not regular password)
  },
});

export async function sendTeacherCredentials({ name, email, username, password, department, batches }) {
  const batchList = batches?.length ? batches.join(", ") : "Not assigned yet";
  const loginUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  await transporter.sendMail({
    from: `"IPT Computer Center" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Your Teacher Account Has Been Created — IPT Computer Center",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 30px; border-radius: 12px;">
        <div style="background: #1e40af; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 20px;">💻 IPT Computer Center</h1>
          <p style="color: #bfdbfe; margin: 6px 0 0;">Teacher Account Created</p>
        </div>

        <p style="color: #374151;">Dear <strong>${name}</strong>,</p>
        <p style="color: #374151;">Your teacher account has been successfully created. Here are your login credentials:</p>

        <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table style="width:100%; color: #e2e8f0; font-size: 14px;">
            <tr><td style="padding: 6px 0; color:#94a3b8;">🔗 Login URL</td><td><a href="${loginUrl}" style="color:#60a5fa;">${loginUrl}</a></td></tr>
            <tr><td style="padding: 6px 0; color:#94a3b8;">👤 Username</td><td><strong>${username}</strong></td></tr>
            <tr><td style="padding: 6px 0; color:#94a3b8;">🔒 Password</td><td><strong>${password}</strong></td></tr>
            <tr><td style="padding: 6px 0; color:#94a3b8;">🏫 Department</td><td>${department}</td></tr>
            <tr><td style="padding: 6px 0; color:#94a3b8;">📚 Batches</td><td>${batchList}</td></tr>
          </table>
        </div>

        <p style="color: #6b7280; font-size: 13px;">Please change your password after your first login.</p>

        <div style="border-top: 1px solid #e5e7eb; margin-top: 24px; padding-top: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
          IPT Computer Center — Student Management Portal
        </div>
      </div>
    `,
  });
}

export async function sendOtpEmail({ name, email, otp }) {
  await transporter.sendMail({
    from: `"IPT Computer Center" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Password Reset OTP — IPT Computer Center",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #f8fafc; padding: 30px; border-radius: 12px;">
        <div style="background: #1e40af; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 20px;">💻 IPT Computer Center</h1>
          <p style="color: #bfdbfe; margin: 6px 0 0;">Password Reset Request</p>
        </div>
        <p style="color: #374151;">Dear <strong>${name}</strong>,</p>
        <p style="color: #374151;">Your password reset OTP is:</p>
        <div style="text-align: center; margin: 24px 0;">
          <div style="display: inline-block; background: #1e293b; color: #60a5fa; font-size: 36px; font-weight: bold; letter-spacing: 10px; padding: 16px 32px; border-radius: 12px; border: 2px solid #3b82f6;">
            ${otp}
          </div>
        </div>
        <p style="color: #6b7280; font-size: 13px; text-align: center;">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <div style="border-top: 1px solid #e5e7eb; margin-top: 24px; padding-top: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
          IPT Computer Center — Student Management Portal
        </div>
      </div>
    `,
  });
}
