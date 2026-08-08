'use strict';

const { Resend } = require('resend');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Service d'email centralisé (Resend). Deux usages :
 *   - sendTeamInvitation : invitation d'un membre d'équipe (admin/modérateur) ;
 *   - sendPlayerReferral : parrainage joueur → ami.
 *
 * Règle d'or : un échec d'envoi ne doit JAMAIS interrompre le flux métier.
 * Toutes les fonctions renvoient `{ sent: boolean, id?, error?, skipped? }`
 * et n'émettent jamais d'exception (try/catch interne + journalisation).
 *
 * Sans `RESEND_API_KEY` (tests, dev non configuré), les envois sont des no-op
 * journalisés (`{ sent: false, skipped: true }`).
 *
 * Le HTML utilise UNIQUEMENT des styles inline (les clients mail ignorent le CSS
 * externe) et une mise en page par tableaux (compatibilité Outlook/Gmail).
 */

// Palette « Cockpit Émeraude » (DESIGN.md).
const COLORS = {
  green900: '#0b2e1a',
  gold: '#d4a017',
  cream: '#fdf6e9',
  ink: '#1a1a1a',
  muted: '#6b7280',
  border: '#e5e7eb',
};

const FONT = "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif";

// Client Resend initialisé paresseusement (pas d'instanciation sans clé).
let client = null;
function getClient() {
  if (client) return client;
  if (!env.email.apiKey) return null;
  client = new Resend(env.email.apiKey);
  return client;
}

/**
 * Échappe une valeur destinée à du HTML (texte OU attribut). Les noms d'invité,
 * d'invitant et de parrain sont saisis par l'utilisateur : sans échappement, un
 * lien ou une balise injecté(e) passerait dans l'email (phishing / HTML injection).
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL sûre pour un attribut href : on n'autorise que http(s) (sinon `#`), puis on
 * échappe pour empêcher toute évasion d'attribut. Les URLs sont construites côté
 * serveur (base + token/encodeURIComponent), mais on durcit par défense en profondeur.
 */
function safeUrl(url) {
  const s = String(url ?? '');
  return /^https?:\/\//i.test(s) ? esc(s) : '#';
}

/** Libellé bilingue du rôle pour l'email d'invitation. */
function roleLabel(role, lang) {
  const map = {
    fr: { moderator: 'Modérateur', admin: 'Administrateur', super_admin: 'Super administrateur' },
    en: { moderator: 'Moderator', admin: 'Administrator', super_admin: 'Super administrator' },
  };
  return (map[lang] || map.fr)[role] || role;
}

/**
 * Gabarit commun : en-tête vert profond + logo or, corps blanc, pied discret.
 * @param {{ preheader, headingHtml, bodyHtml, ctaLabel, ctaUrl, footerHtml }} parts
 */
function layout({ preheader, bodyHtml, ctaLabel, ctaUrl, footerHtml }) {
  // URL validée (http/https sinon « # ») et échappée — réutilisée dans l'attribut
  // href ET dans l'affichage texte, pour ne jamais montrer un schéma douteux.
  const safeCtaUrl = safeUrl(ctaUrl);
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${COLORS.cream};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.cream};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${COLORS.border};">
        <tr>
          <td style="background-color:${COLORS.green900};padding:28px 32px;text-align:center;">
            <span style="font-family:${FONT};font-size:26px;font-weight:700;color:${COLORS.gold};letter-spacing:0.5px;">Creveton</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-family:${FONT};color:${COLORS.ink};font-size:15px;line-height:1.6;">
            ${bodyHtml}
            ${
              // CTA optionnel : l'email de réinitialisation porte un CODE à
              // recopier dans l'app, pas un lien. Sans cette garde, il aurait
              // affiché un bouton « # » et l'URL « # » en dessous.
              ctaUrl
                ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
              <tr><td style="border-radius:8px;background-color:${COLORS.gold};">
                <a href="${safeCtaUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.green900};text-decoration:none;border-radius:8px;">${esc(ctaLabel)}</a>
              </td></tr>
            </table>
            <p style="font-family:${FONT};font-size:12px;color:${COLORS.muted};margin:16px 0 0;word-break:break-all;">${safeCtaUrl}</p>`
                : ''
            }
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:12px;color:${COLORS.muted};text-align:center;">
            ${footerHtml}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Envoi bas-niveau : renvoie toujours un résultat, ne jette jamais.
 *
 * `logSubject` remplace `subject` dans les JOURNAUX. Nécessaire dès que le sujet
 * contient un secret : celui du code de réinitialisation le porte en clair (pour
 * qu'il se lise dans l'aperçu de notification), et il atterrissait donc en clair
 * dans les logs applicatifs — Railway, agrégateur, n'importe qui y ayant accès
 * pouvait prendre un compte dans les 15 minutes. Le sujet réel part bien à
 * Resend ; seule la trace est caviardée.
 */
async function send({ to, subject, html, logSubject }) {
  const logged = logSubject || subject;
  // Hermétique en test : jamais d'appel réseau réel, même si une clé est présente.
  if (env.isTest) {
    return { sent: false, skipped: true };
  }
  const resend = getClient();
  if (!resend) {
    logger.warn('Email non envoyé (RESEND_API_KEY absente) — no-op', { to, subject: logged });
    return { sent: false, skipped: true };
  }
  try {
    const { data, error } = await resend.emails.send({ from: env.email.from, to, subject, html });
    if (error) {
      const message = error.message || String(error);
      logger.error('Échec envoi email (Resend)', { to, subject: logged, error: message });
      return { sent: false, error: message };
    }
    logger.info('Email envoyé', { to, subject: logged, id: data?.id });
    return { sent: true, id: data?.id || null };
  } catch (err) {
    logger.error('Exception envoi email', { to, subject: logged, error: err.message });
    return { sent: false, error: err.message };
  }
}

/**
 * Invitation équipe (admin/modérateur). Email professionnel.
 * @param {{ to, inviteeName?, inviterName?, role, inviteUrl, lang }} p
 * @returns {Promise<{ sent: boolean, id?, error?, skipped? }>}
 */
async function sendTeamInvitation({ to, inviteeName, inviterName, role, inviteUrl, lang = 'fr' }) {
  const isFr = lang !== 'en';
  // Valeurs brutes (sujet en texte simple, preheader échappé par layout) vs
  // échappées (injectées telles quelles dans le corps HTML).
  const roleName = roleLabel(role, isFr ? 'fr' : 'en');
  const rlEsc = esc(roleName);
  const inviterEsc = esc(inviterName || 'Creveton');
  const inviteeEsc = esc(inviteeName || '');
  const hello = inviteeName ? `${isFr ? 'Bonjour' : 'Hi'} ${inviteeEsc},` : `${isFr ? 'Bonjour,' : 'Hello,'}`;

  const subject = isFr
    ? "Vous êtes invité(e) à rejoindre l'équipe Creveton"
    : "You're invited to join the Creveton team";

  const bodyHtml = isFr
    ? `<p style="margin:0 0 12px;">${hello}</p>
       <p style="margin:0 0 12px;"><strong>${inviterEsc}</strong> vous invite à rejoindre l'équipe Creveton en tant que <strong style="color:${COLORS.green900};">${rlEsc}</strong>.</p>
       <p style="margin:0;">Cliquez sur le bouton ci-dessous pour activer votre compte et définir votre mot de passe.</p>`
    : `<p style="margin:0 0 12px;">${hello}</p>
       <p style="margin:0 0 12px;"><strong>${inviterEsc}</strong> invites you to join the Creveton team as <strong style="color:${COLORS.green900};">${rlEsc}</strong>.</p>
       <p style="margin:0;">Click the button below to activate your account and set your password.</p>`;

  const footerHtml = isFr
    ? 'Creveton · Ce lien expire dans 72h'
    : 'Creveton · This link expires in 72h';

  const html = layout({
    preheader: isFr ? `Rejoignez l'équipe Creveton (${roleName})` : `Join the Creveton team (${roleName})`,
    bodyHtml,
    ctaLabel: isFr ? 'Activer mon compte' : 'Activate my account',
    ctaUrl: inviteUrl,
    footerHtml,
  });

  return send({ to, subject, html });
}

/**
 * Parrainage joueur → ami. Ton ludique, orienté jeu.
 * @param {{ to, referrerName, referralCode, lang }} p
 * @returns {Promise<{ sent: boolean, id?, error?, skipped? }>}
 */
async function sendPlayerReferral({ to, referrerName, referralCode, lang = 'fr' }) {
  const isFr = lang !== 'en';
  // Brut pour le sujet (texte) + le preheader (layout l'échappe) ; échappé pour le corps HTML.
  const referrerRaw = referrerName || (isFr ? 'Un ami' : 'A friend');
  const referrerEsc = esc(referrerRaw);
  const referralCodeEsc = esc(referralCode);
  const referralUrl = `${env.email.appDeepLinkUrl}?ref=${encodeURIComponent(referralCode)}`;

  const subject = isFr
    ? `${referrerRaw} t'invite à jouer sur Creveton 🎯`
    : `${referrerRaw} invites you to play on Creveton 🎯`;

  const bodyHtml = isFr
    ? `<p style="margin:0 0 12px;">Ton ami <strong>${referrerEsc}</strong> t'invite à tester tes connaissances sur <strong style="color:${COLORS.green900};">Creveton</strong> 🎯</p>
       <p style="margin:0 0 12px;">Quiz, tournois, classements : affronte le Cameroun entier et grimpe les niveaux !</p>
       <p style="margin:0;">Ton code de parrainage : <strong style="color:${COLORS.gold};letter-spacing:1px;">${referralCodeEsc}</strong></p>`
    : `<p style="margin:0 0 12px;">Your friend <strong>${referrerEsc}</strong> invites you to test your knowledge on <strong style="color:${COLORS.green900};">Creveton</strong> 🎯</p>
       <p style="margin:0 0 12px;">Quizzes, tournaments, leaderboards: take on all of Cameroon and level up!</p>
       <p style="margin:0;">Your referral code: <strong style="color:${COLORS.gold};letter-spacing:1px;">${referralCodeEsc}</strong></p>`;

  const footerHtml = isFr
    ? 'Creveton · Bonus de bienvenue : un boost d\'XP à ta première partie ⚡'
    : 'Creveton · Welcome bonus: an XP boost on your first game ⚡';

  const html = layout({
    preheader: isFr ? `${referrerRaw} t'invite à jouer 🎯` : `${referrerRaw} invites you to play 🎯`,
    bodyHtml,
    ctaLabel: isFr ? 'Rejoindre Creveton' : 'Join Creveton',
    ctaUrl: referralUrl,
    footerHtml,
  });

  return send({ to, subject, html });
}

/**
 * Code de réinitialisation de mot de passe. PAS de lien : le code se recopie
 * dans l'app (mobile) ou la console (admin). Un lien aurait exigé une page
 * d'atterrissage et des liens universels iOS/Android non configurés — et un
 * code se lit aussi bien depuis un autre appareil.
 *
 * Le corps dit explicitement quoi faire si la demande ne vient pas de
 * l'utilisateur : ne rien faire suffit, aucun mot de passe n'a encore changé.
 *
 * @param {{ to, name?, code, expiresMinutes, lang }} p
 */
async function sendPasswordResetCode({ to, name, code, expiresMinutes, lang = 'fr' }) {
  const isFr = lang !== 'en';
  const nameEsc = esc(name || '');
  const codeEsc = esc(code);
  const hello = name
    ? `${isFr ? 'Bonjour' : 'Hi'} ${nameEsc},`
    : `${isFr ? 'Bonjour,' : 'Hello,'}`;

  const subject = isFr
    ? `Ton code de réinitialisation Creveton : ${code}`
    : `Your Creveton reset code: ${code}`;

  // Le code est en gros, espacé, sur fond crème : il doit se lire d'un coup
  // d'œil dans l'aperçu de notification comme dans le corps du message.
  const codeBlock = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="background-color:${COLORS.cream};border:1px solid ${COLORS.border};border-radius:10px;padding:18px 28px;text-align:center;">
        <span style="font-family:${FONT};font-size:32px;font-weight:700;letter-spacing:8px;color:${COLORS.green900};">${codeEsc}</span>
      </td></tr>
    </table>`;

  const bodyHtml = isFr
    ? `<p style="margin:0 0 12px;">${hello}</p>
       <p style="margin:0 0 12px;">Voici ton code pour définir un nouveau mot de passe :</p>
       ${codeBlock}
       <p style="margin:0 0 12px;">Il est valable <strong>${expiresMinutes} minutes</strong> et ne sert qu'une fois.</p>
       <p style="margin:0;color:${COLORS.muted};font-size:13px;">Tu n'as rien demandé ? Ignore cet email : ton mot de passe reste inchangé.</p>`
    : `<p style="margin:0 0 12px;">${hello}</p>
       <p style="margin:0 0 12px;">Here is your code to set a new password:</p>
       ${codeBlock}
       <p style="margin:0 0 12px;">It is valid for <strong>${expiresMinutes} minutes</strong> and can only be used once.</p>
       <p style="margin:0;color:${COLORS.muted};font-size:13px;">Didn't request this? Ignore this email — your password stays unchanged.</p>`;

  const html = layout({
    preheader: isFr
      ? `Code ${code} — valable ${expiresMinutes} min`
      : `Code ${code} — valid for ${expiresMinutes} min`,
    bodyHtml,
    // Pas de CTA : le layout omet le bouton quand `ctaUrl` est absent.
    footerHtml: isFr
      ? 'Creveton · Ne partage jamais ce code.'
      : 'Creveton · Never share this code.',
  });

  // Le sujet porte le code : caviardé dans les journaux (cf. send).
  return send({ to, subject, html, logSubject: 'Code de réinitialisation Creveton' });
}

/**
 * Code de vérification d'adresse email (inscription ou changement d'adresse).
 *
 * Même forme que le code de réinitialisation — code recopié dans l'app, pas de
 * lien — mais un texte distinct : ici rien n'est en danger, on confirme
 * simplement une adresse. Le confondre avec un email de sécurité banaliserait
 * l'autre.
 *
 * @param {{ to, name?, code, expiresMinutes, isChange?, lang }} p
 */
async function sendEmailVerificationCode({ to, name, code, expiresMinutes, isChange = false, lang = 'fr' }) {
  const isFr = lang !== 'en';
  const nameEsc = esc(name || '');
  const codeEsc = esc(code);
  const hello = name
    ? `${isFr ? 'Bonjour' : 'Hi'} ${nameEsc},`
    : `${isFr ? 'Bonjour,' : 'Hello,'}`;

  const subject = isFr
    ? `Confirme ton adresse Creveton : ${code}`
    : `Confirm your Creveton address: ${code}`;

  const codeBlock = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="background-color:${COLORS.cream};border:1px solid ${COLORS.border};border-radius:10px;padding:18px 28px;text-align:center;">
        <span style="font-family:${FONT};font-size:32px;font-weight:700;letter-spacing:8px;color:${COLORS.green900};">${codeEsc}</span>
      </td></tr>
    </table>`;

  // Le « pourquoi » compte plus que le « comment » : sans adresse confirmée, la
  // récupération de mot de passe est refusée. Le dire ici évite de le découvrir
  // le jour où on en a besoin.
  const why = isFr
    ? `<p style="margin:0 0 12px;">Une adresse confirmée nous permet de te redonner accès à ton compte si tu oublies ton mot de passe.</p>`
    : `<p style="margin:0 0 12px;">A confirmed address lets us get you back into your account if you forget your password.</p>`;

  const intro = isFr
    ? isChange
      ? 'Voici le code pour confirmer ta <strong>nouvelle</strong> adresse :'
      : 'Voici le code pour confirmer ton adresse :'
    : isChange
      ? 'Here is the code to confirm your <strong>new</strong> address:'
      : 'Here is the code to confirm your address:';

  const bodyHtml = `<p style="margin:0 0 12px;">${hello}</p>
       <p style="margin:0 0 12px;">${intro}</p>
       ${codeBlock}
       <p style="margin:0 0 12px;">${
         isFr
           ? `Il est valable <strong>${expiresMinutes} minutes</strong>.`
           : `It is valid for <strong>${expiresMinutes} minutes</strong>.`
       }</p>
       ${why}
       <p style="margin:0;color:${COLORS.muted};font-size:13px;">${
         isFr
           ? "Tu n'as rien demandé ? Ignore cet email."
           : "Didn't request this? Just ignore this email."
       }</p>`;

  const html = layout({
    preheader: isFr ? `Code ${code} — confirmation d'adresse` : `Code ${code} — address confirmation`,
    bodyHtml,
    footerHtml: isFr ? 'Creveton · Ne partage jamais ce code.' : 'Creveton · Never share this code.',
  });

  // Sujet caviardé dans les journaux : il porte le code (cf. send).
  return send({ to, subject, html, logSubject: "Code de vérification d'adresse Creveton" });
}

module.exports = {
  sendTeamInvitation,
  sendPlayerReferral,
  sendPasswordResetCode,
  sendEmailVerificationCode,
};
