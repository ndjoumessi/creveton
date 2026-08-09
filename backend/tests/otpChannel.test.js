'use strict';

/**
 * Acheminement OTP : ordre des canaux, saut des non-configurés, repli sur échec.
 *
 * C'est la pièce qui DÉCIDE — elle mérite d'être testée sans réseau. Les trois
 * services sous-jacents sont donc doublés, et `env` est réécrit par test pour
 * simuler « WhatsApp configuré », « Twilio seul », etc.
 */

process.env.NODE_ENV = 'test';

jest.mock('../src/services/whatsappService', () => ({
  isConfigured: jest.fn(() => false),
  sendAuthCode: jest.fn(),
}));
jest.mock('../src/services/smsService', () => ({ sendSms: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ sendOtpCode: jest.fn() }));

const env = require('../src/config/env');
const whatsappService = require('../src/services/whatsappService');
const smsService = require('../src/services/smsService');
const emailService = require('../src/services/emailService');
const otpChannel = require('../src/services/otpChannel');

const TARGET = { phone: '+237690000000', email: 'awa@example.cm', name: 'Awa' };

/**
 * Rend un canal « configuré » en posant ce qu'inspecte `isConfigured`.
 *
 * `env.isTest` est forcé à false : le canal email se déclare indisponible en
 * test, parce que le VRAI `emailService` y court-circuite et ne poste rien. Ici
 * il est doublé, donc cette protection n'a pas lieu d'être — sans ce réglage on
 * ne testerait jamais le repli email.
 */
function configure({ whatsapp = false, sms = false, email = false }) {
  whatsappService.isConfigured.mockReturnValue(whatsapp);
  env.twilio.accountSid = sms ? 'AC_test' : '';
  env.twilio.authToken = sms ? 'tok' : '';
  env.email.apiKey = email ? 'key' : '';
  env.isTest = false;
}

describe('otpChannel.sendCode', () => {
  const initial = {
    sid: env.twilio.accountSid,
    tok: env.twilio.authToken,
    key: env.email.apiKey,
    channels: env.otp.channels,
    isProd: env.isProd,
    isTest: env.isTest,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    env.otp.channels = 'whatsapp,sms,email';
    env.isProd = false;
    whatsappService.sendAuthCode.mockResolvedValue({ id: 'wamid.1' });
    smsService.sendSms.mockResolvedValue({ sid: 'SM1' });
    emailService.sendOtpCode.mockResolvedValue({ sent: true });
  });

  afterAll(() => {
    env.twilio.accountSid = initial.sid;
    env.twilio.authToken = initial.tok;
    env.email.apiKey = initial.key;
    env.otp.channels = initial.channels;
    env.isProd = initial.isProd;
    env.isTest = initial.isTest;
  });

  test('WhatsApp configuré → il sert, et lui seul', async () => {
    configure({ whatsapp: true, sms: true, email: true });

    const res = await otpChannel.sendCode(TARGET, '123456');

    expect(res.channel).toBe('whatsapp');
    expect(whatsappService.sendAuthCode).toHaveBeenCalledWith('+237690000000', '123456');
    // Le repli ne doit PAS partir en parallèle : un code, un canal.
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(emailService.sendOtpCode).not.toHaveBeenCalled();
  });

  test('canal non configuré → sauté sans bruit (déploiement progressif)', async () => {
    configure({ whatsapp: false, sms: true, email: true });

    const res = await otpChannel.sendCode(TARGET, '123456');

    expect(res.channel).toBe('sms');
    expect(whatsappService.sendAuthCode).not.toHaveBeenCalled();
  });

  test('échec WhatsApp → repli SMS', async () => {
    configure({ whatsapp: true, sms: true, email: true });
    whatsappService.sendAuthCode.mockRejectedValue(new Error('template refusé'));

    const res = await otpChannel.sendCode(TARGET, '123456');

    expect(res.channel).toBe('sms');
    expect(smsService.sendSms).toHaveBeenCalled();
  });

  test('échec WhatsApp ET SMS → repli email', async () => {
    configure({ whatsapp: true, sms: true, email: true });
    whatsappService.sendAuthCode.mockRejectedValue(new Error('boom'));
    smsService.sendSms.mockRejectedValue(new Error('twilio down'));

    const res = await otpChannel.sendCode(TARGET, '123456');

    expect(res.channel).toBe('email');
    expect(emailService.sendOtpCode).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'awa@example.cm', code: '123456' })
    );
  });

  test('email sans adresse → canal injoignable, on ne tente pas', async () => {
    configure({ whatsapp: false, sms: false, email: true });

    // Pas d'email sur la cible et aucun autre canal : en dev, on simule.
    const res = await otpChannel.sendCode({ phone: '+237690000000' }, '123456');

    expect(emailService.sendOtpCode).not.toHaveBeenCalled();
    expect(res.simulated).toBe(true);
  });

  test('`sent:false` d\'emailService compte comme un ÉCHEC, pas un succès', async () => {
    configure({ whatsapp: false, sms: false, email: true });
    emailService.sendOtpCode.mockResolvedValue({ sent: false, error: 'domaine non vérifié' });
    env.isProd = true; // en prod, pas de repli « simulé » qui masquerait la panne

    await expect(otpChannel.sendCode(TARGET, '123456')).rejects.toThrow(/aucun canal/);
  });

  test('en PRODUCTION, aucun canal configuré → on lève (jamais de faux succès)', async () => {
    configure({ whatsapp: false, sms: false, email: false });
    env.isProd = true;

    await expect(otpChannel.sendCode(TARGET, '123456')).rejects.toThrow(/aucun canal/);
  });

  test('hors production, aucun canal → simulé pour ne pas bloquer le développement', async () => {
    configure({ whatsapp: false, sms: false, email: false });

    const res = await otpChannel.sendCode(TARGET, '123456');

    expect(res).toEqual({ channel: 'simulated', simulated: true });
  });

  test('OTP_CHANNELS impose l\'ordre, et un nom inconnu est ignoré', async () => {
    configure({ whatsapp: true, sms: true, email: true });
    env.otp.channels = 'pigeon, sms , whatsapp';

    expect(otpChannel.orderedNames()).toEqual(['sms', 'whatsapp']);

    const res = await otpChannel.sendCode(TARGET, '123456');
    expect(res.channel).toBe('sms');
  });
});
