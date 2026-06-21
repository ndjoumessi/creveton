'use strict';

process.env.NODE_ENV = 'test';

// --- Dépendances externes mockées (pas de Postgres / Redis / Twilio en test) ---
jest.mock('../src/config/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/services/otpService', () => ({
  issue: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../src/models/user.model', () => ({
  // toPublic minimal : suffisant pour les assertions du contrat.
  toPublic: (u) => (u ? { id: u.id, role: u.role, phone: u.phone } : null),
  findByEmail: jest.fn(),
  findByPhone: jest.fn(),
  findById: jest.fn(),
  findByReferralCode: jest.fn(),
  create: jest.fn(),
  markPhoneVerified: jest.fn(),
  touchLastActive: jest.fn().mockResolvedValue(undefined),
  generateUniqueReferralCode: jest.fn().mockResolvedValue('CREV-TEST'),
}));

const bcrypt = require('bcryptjs');
const authService = require('../src/services/authService');
const userModel = require('../src/models/user.model');
const otpService = require('../src/services/otpService');
const { redis } = require('../src/config/redis');
const { verifyAccessToken, signRefreshToken } = require('../src/utils/jwt');

const VALID_INPUT = {
  name: 'Awa Mballa',
  email: 'awa@example.cm',
  phone: '+237690000000',
  password: 'MotDePasse1',
  lang: 'fr',
};

const fakeUser = (over = {}) => ({
  id: 'u-123',
  name: 'Awa Mballa',
  email: 'awa@example.cm',
  phone: '+237690000000',
  password_hash: null,
  phone_verified: true,
  status: 'active',
  role: 'player',
  level: 1,
  ...over,
});

describe('authService.register', () => {
  test('hash bcrypt coût 12, crée le user et envoie un OTP', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    userModel.findByPhone.mockResolvedValue(null);
    userModel.findByReferralCode.mockResolvedValue(null);
    userModel.create.mockResolvedValue(fakeUser({ phone_verified: false }));
    otpService.issue.mockResolvedValue({ otp_sent: true, otp_expires_at: '2026-06-21T10:10:00Z' });

    const res = await authService.register(VALID_INPUT);

    expect(res).toEqual({
      user_id: 'u-123',
      phone: '+237690000000',
      otp_sent: true,
      otp_expires_at: '2026-06-21T10:10:00Z',
    });

    // Le hash transmis au modèle encode le coût 12 ($2a$12$...) et vérifie le mdp.
    const passedHash = userModel.create.mock.calls[0][0].password_hash;
    expect(passedHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare('MotDePasse1', passedHash)).toBe(true);
    expect(otpService.issue).toHaveBeenCalledWith('+237690000000');
  });

  test('email déjà utilisé → EMAIL_ALREADY_USED', async () => {
    userModel.findByEmail.mockResolvedValue(fakeUser());
    await expect(authService.register(VALID_INPUT)).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_USED',
      httpStatus: 409,
    });
  });

  test('téléphone déjà utilisé → PHONE_ALREADY_USED', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    userModel.findByPhone.mockResolvedValue(fakeUser());
    await expect(authService.register(VALID_INPUT)).rejects.toMatchObject({
      code: 'PHONE_ALREADY_USED',
    });
  });

  test('rattache le parrain si le referral_code existe', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    userModel.findByPhone.mockResolvedValue(null);
    userModel.findByReferralCode.mockResolvedValue(fakeUser({ id: 'parrain-1' }));
    userModel.create.mockResolvedValue(fakeUser({ phone_verified: false }));
    otpService.issue.mockResolvedValue({ otp_sent: true, otp_expires_at: 'x' });

    await authService.register({ ...VALID_INPUT, referral_code: 'CREV-ABCD' });
    expect(userModel.create.mock.calls[0][0].referred_by).toBe('parrain-1');
  });
});

describe('authService.verifyOtp', () => {
  test('OTP valide → phone_verified + tokens émis et session allowlistée', async () => {
    otpService.verify.mockResolvedValue(true);
    userModel.findByPhone.mockResolvedValue(fakeUser({ phone_verified: false }));
    userModel.markPhoneVerified.mockResolvedValue(fakeUser({ phone_verified: true }));

    const res = await authService.verifyOtp('+237690000000', '482915');

    expect(res.token_type).toBe('Bearer');
    expect(res.expires_in).toBe(3600);
    expect(res.user).toMatchObject({ id: 'u-123' });
    // access token signé et lisible
    expect(verifyAccessToken(res.access_token).sub).toBe('u-123');
    // session enregistrée dans Redis (allowlist refresh)
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^refresh:u-123:/),
      '1',
      'EX',
      expect.any(Number)
    );
  });

  test('OTP invalide → propage l’erreur OTP', async () => {
    const ApiError = require('../src/utils/ApiError');
    otpService.verify.mockRejectedValue(new ApiError('OTP_INVALID'));
    await expect(authService.verifyOtp('+237690000000', '000000')).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });
});

describe('authService.login', () => {
  let hash;
  beforeAll(async () => {
    hash = await bcrypt.hash('MotDePasse1', 12);
  });

  test('identifiants corrects → tokens', async () => {
    userModel.findByEmail.mockResolvedValue(fakeUser({ password_hash: hash }));
    const res = await authService.login('awa@example.cm', 'MotDePasse1');
    expect(res.access_token).toBeDefined();
    expect(res.refresh_token).toBeDefined();
  });

  test('compte inconnu → AUTH_INVALID_CREDENTIALS', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    await expect(authService.login('x@y.cm', 'z')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });

  test('mauvais mot de passe → AUTH_INVALID_CREDENTIALS', async () => {
    userModel.findByEmail.mockResolvedValue(fakeUser({ password_hash: hash }));
    await expect(authService.login('awa@example.cm', 'mauvais')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });

  test('compte suspendu → ACCOUNT_SUSPENDED', async () => {
    userModel.findByEmail.mockResolvedValue(fakeUser({ password_hash: hash, status: 'suspended' }));
    await expect(authService.login('awa@example.cm', 'MotDePasse1')).rejects.toMatchObject({
      code: 'ACCOUNT_SUSPENDED',
    });
  });

  test('téléphone non vérifié → PHONE_NOT_VERIFIED', async () => {
    userModel.findByEmail.mockResolvedValue(
      fakeUser({ password_hash: hash, phone_verified: false })
    );
    await expect(authService.login('awa@example.cm', 'MotDePasse1')).rejects.toMatchObject({
      code: 'PHONE_NOT_VERIFIED',
    });
  });
});

describe('authService.refresh', () => {
  test('refresh allowlisté → nouvel access token', async () => {
    const token = signRefreshToken({ id: 'u-123' }, 'sid-1');
    redis.get.mockResolvedValue('1');
    userModel.findById.mockResolvedValue(fakeUser());

    const res = await authService.refresh(token);
    expect(res.expires_in).toBe(3600);
    expect(verifyAccessToken(res.access_token).sub).toBe('u-123');
    expect(verifyAccessToken(res.access_token).sid).toBe('sid-1');
  });

  test('refresh révoqué (absent de l’allowlist) → REFRESH_TOKEN_INVALID', async () => {
    const token = signRefreshToken({ id: 'u-123' }, 'sid-1');
    redis.get.mockResolvedValue(null);
    await expect(authService.refresh(token)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  test('token illisible → REFRESH_TOKEN_INVALID', async () => {
    await expect(authService.refresh('pas.un.jwt')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });
});

describe('authService.logout', () => {
  test('supprime la session courante de l’allowlist', async () => {
    await authService.logout('u-123', 'sid-1');
    expect(redis.del).toHaveBeenCalledWith('refresh:u-123:sid-1');
  });
});
