import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '465'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Verify connection configuration
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Email service configuration error:', error);
      } else {
        this.logger.log('Email service is ready to send emails');
      }
    });
  }

  /**
   * Send email verification code
   */
  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const subject = 'Verify Your Email Address';
    const html = this.getVerificationEmailTemplate(code);

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        html,
      });
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}:`, error);
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Send password reset code
   */
  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    const subject = 'Reset Your Password';
    const html = this.getPasswordResetEmailTemplate(code);

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        html,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Email verification template
   */
  private getVerificationEmailTemplate(code: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
              text-align: center;
            }
            .code-box {
              background-color: #ffffff;
              border: 2px dashed #4CAF50;
              border-radius: 8px;
              padding: 20px;
              margin: 30px 0;
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #4CAF50;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Verify Your Email Address</h1>
            <p>Thank you for registering! Please use the verification code below to complete your registration:</p>

            <div class="code-box">
              ${code}
            </div>

            <p>This code will expire in ${process.env.EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES || '30'} minutes.</p>

            <div class="footer">
              <p>If you didn't request this verification, please ignore this email.</p>
              <p>&copy; ${new Date().getFullYear()} Crypto Watcher. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Password reset email template
   */
  private getPasswordResetEmailTemplate(code: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
              text-align: center;
            }
            .code-box {
              background-color: #ffffff;
              border: 2px dashed #ff9800;
              border-radius: 8px;
              padding: 20px;
              margin: 30px 0;
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #ff9800;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
            .warning {
              background-color: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #856404;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Reset Your Password</h1>
            <p>We received a request to reset your password. Use the code below to proceed:</p>

            <div class="code-box">
              ${code}
            </div>

            <p>This code will expire in ${process.env.PASSWORD_RESET_CODE_EXPIRY_MINUTES || '15'} minutes.</p>

            <div class="warning">
              <strong>Security Notice:</strong> If you didn't request a password reset, please ignore this email and ensure your account is secure.
            </div>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Crypto Watcher. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Send 2FA enabled notification email
   */
  async send2FAEnabledEmail(email: string, name: string): Promise<void> {
    const subject = '2FA Enabled on Your Account';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
            }
            .success-box {
              background-color: #d4edda;
              border: 1px solid #c3e6cb;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #155724;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>2FA Enabled Successfully</h1>
            <p>Hello ${name || 'User'},</p>
            <p>Two-Factor Authentication (2FA) has been enabled on your account.</p>

            <div class="success-box">
              <strong>Security Enhanced:</strong> Your account is now protected with an additional layer of security.
            </div>

            <p><strong>What this means:</strong></p>
            <ul>
              <li>You'll need your authenticator app to log in</li>
              <li>Backup codes have been provided for account recovery</li>
              <li>Your account is more secure against unauthorized access</li>
            </ul>

            <p><strong>Important:</strong> If you didn't enable 2FA, please contact support immediately.</p>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Crypto Watcher. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        html,
      });
      this.logger.log(`2FA enabled notification sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send 2FA enabled email to ${email}:`, error);
      // Don't throw - this is a notification email
    }
  }

  /**
   * Send 2FA disabled notification email
   */
  async send2FADisabledEmail(email: string, name: string): Promise<void> {
    const subject = '2FA Disabled on Your Account';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
            }
            .warning {
              background-color: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #856404;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>2FA Disabled on Your Account</h1>
            <p>Hello ${name || 'User'},</p>
            <p>Two-Factor Authentication (2FA) has been disabled on your account.</p>

            <div class="warning">
              <strong>Security Notice:</strong> Your account security has been reduced. We recommend enabling 2FA again for better protection.
            </div>

            <p><strong>What this means:</strong></p>
            <ul>
              <li>You can now log in with just your password</li>
              <li>All backup codes have been deleted</li>
              <li>All existing sessions have been invalidated</li>
            </ul>

            <p><strong>Important:</strong> If you didn't disable 2FA, your account may be compromised. Please secure your account immediately and contact support.</p>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Crypto Watcher. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        html,
      });
      this.logger.log(`2FA disabled notification sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send 2FA disabled email to ${email}:`, error);
      // Don't throw - this is a notification email
    }
  }

  /**
   * Send backup code used notification email
   */
  async sendBackupCodeUsedEmail(email: string, name: string, remainingCodes: number): Promise<void> {
    const subject = 'Backup Code Used for Login';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
            }
            .info-box {
              background-color: #d1ecf1;
              border: 1px solid #bee5eb;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #0c5460;
            }
            .warning {
              background-color: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #856404;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Backup Code Used</h1>
            <p>Hello ${name || 'User'},</p>
            <p>A backup code was used to log in to your account.</p>

            <div class="info-box">
              <strong>Remaining backup codes:</strong> ${remainingCodes}
            </div>

            ${remainingCodes <= 2 ? `
              <div class="warning">
                <strong>Low on backup codes!</strong> You have ${remainingCodes} backup code${remainingCodes === 1 ? '' : 's'} remaining.
                Consider regenerating backup codes from your account settings.
              </div>
            ` : ''}

            <p><strong>Important:</strong> If you didn't use a backup code, your account may be compromised. Please secure your account immediately.</p>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Crypto Watcher. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        html,
      });
      this.logger.log(`Backup code used notification sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send backup code used email to ${email}:`, error);
      // Don't throw - this is a notification email
    }
  }

  /**
   * Send password set notification email for OAuth users
   */
  async sendPasswordSetEmail(email: string, name: string): Promise<void> {
    const subject = 'Password Set Successfully';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
            }
            .success-box {
              background-color: #d4edda;
              border: 1px solid #c3e6cb;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #155724;
            }
            .info-box {
              background-color: #d1ecf1;
              border: 1px solid #bee5eb;
              border-radius: 5px;
              padding: 15px;
              margin: 20px 0;
              color: #0c5460;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Password Set Successfully</h1>
            <p>Hello ${name || 'User'},</p>
            <p>A password has been set for your account.</p>

            <div class="success-box">
              <strong>Success!</strong> You can now log in using either Google OAuth or your email and password.
            </div>

            <div class="info-box">
              <strong>Login Options:</strong>
              <ul>
                <li>Continue logging in with Google</li>
                <li>Or use your email and the new password</li>
              </ul>
            </div>

            <p><strong>Security Tip:</strong> If you didn't set a password, please secure your account immediately and contact support.</p>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Crypto Watcher. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        html,
      });
      this.logger.log(`Password set notification sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password set email to ${email}:`, error);
      // Don't throw - this is a notification email
    }
  }
}
