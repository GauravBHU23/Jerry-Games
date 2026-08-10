// Winner email, sent once when a player clears Level 8.
//
// Configured entirely by environment variables so no address or password is
// ever committed:
//   MAIL_USER  - the Gmail address the mail is sent from
//   MAIL_PASS  - a Gmail App Password (not the account password; create one at
//                Google Account > Security > 2-Step Verification > App passwords)
//   MAIL_TO    - optional, an organiser address that is copied on every win
//
// With nothing configured the game carries on exactly as before and simply
// does not send - a missing mail setup must never break a player's run.

const EVENT_NAME = 'Jerry the Water Saviour';
const PRIZE = 'a free pizza';

// Where the prize is collected. This is the event organisers' pickup point,
// not a claim that any pizza chain is running the offer.
const PICKUP = {
  city: 'Varanasi',
  place: "Domino's Pizza, Lanka",
  address: 'Lanka, near BHU Main Gate, Varanasi, Uttar Pradesh 221005',
  maps: 'https://maps.google.com/?q=Dominos+Pizza+Lanka+Varanasi',
};

function mailerReady() {
  return !!(process.env.MAIL_USER && process.env.MAIL_PASS);
}

let transport = null;
function getTransport() {
  if (transport) return transport;
  const nodemailer = require('nodemailer');
  transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  return transport;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(ms) {
  const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(t / 60), s = t % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// A single-column table layout, because that is what survives Gmail, Outlook
// and every phone client - flexbox and grid do not.
function winnerHtml({ username, score, level, durationMs, rank }) {
  const name = esc(username || 'CHAMPION');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You beat ${esc(EVENT_NAME)}!</title>
</head>
<body style="margin:0;padding:0;background:#0a1628;">
  <!-- preheader: the grey line phones show next to the subject -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    You cleared all 8 levels and saved the river. Your prize is waiting.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#0a1628;padding:24px 12px;">
    <tr>
      <td align="center">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;background:#0e2038;border-radius:14px;overflow:hidden;
                      border:1px solid #1d3f66;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <!-- header -->
          <tr>
            <td align="center" style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#0b2a4a;">
                <tr>
                  <td align="center" style="padding:34px 24px 26px 24px;">
                    <div style="font-size:44px;line-height:1;margin-bottom:10px;">🏆</div>
                    <h1 style="margin:0;color:#ffd94a;font-size:26px;line-height:1.25;
                               letter-spacing:.5px;font-weight:700;">
                      CONGRATULATIONS!
                    </h1>
                    <p style="margin:10px 0 0 0;color:#cfe9ff;font-size:15px;line-height:1.5;">
                      You saved the river, ${name}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- winner badge -->
          <tr>
            <td style="padding:26px 24px 6px 24px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#13304f;border:2px solid #ffd94a;border-radius:10px;">
                <tr>
                  <td align="center" style="padding:16px 26px;">
                    <div style="color:#ffd94a;font-size:13px;letter-spacing:2px;font-weight:700;">
                      LEVEL 8 COMPLETE
                    </div>
                    <div style="color:#ffffff;font-size:20px;font-weight:700;padding-top:6px;">
                      ${name}
                    </div>
                    <div style="color:#8fb8db;font-size:12px;padding-top:4px;">
                      THE TYCOON TOWER has fallen
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- stats -->
          <tr>
            <td style="padding:22px 24px 4px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="33%" align="center" style="padding:10px 4px;background:#12293f;
                      border-radius:8px 0 0 8px;border-right:1px solid #0e2038;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:1px;">SCORE</div>
                    <div style="color:#ffffff;font-size:19px;font-weight:700;padding-top:4px;">
                      ${esc(score)}
                    </div>
                  </td>
                  <td width="33%" align="center" style="padding:10px 4px;background:#12293f;
                      border-right:1px solid #0e2038;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:1px;">TIME</div>
                    <div style="color:#9fe8c4;font-size:19px;font-weight:700;padding-top:4px;">
                      ${fmtTime(durationMs)}
                    </div>
                  </td>
                  <td width="33%" align="center" style="padding:10px 4px;background:#12293f;
                      border-radius:0 8px 8px 0;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:1px;">RANK</div>
                    <div style="color:#ffd94a;font-size:19px;font-weight:700;padding-top:4px;">
                      ${rank ? '#' + esc(rank) : '-'}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- prize -->
          <tr>
            <td style="padding:24px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1a1206;border:1px solid #6b5a1a;border-radius:10px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-size:30px;line-height:1;padding-bottom:8px;">🍕</div>
                    <div style="color:#ffd94a;font-size:17px;font-weight:700;padding-bottom:8px;">
                      Your prize: ${esc(PRIZE)}
                    </div>
                    <div style="color:#e8dcc0;font-size:14px;line-height:1.6;">
                      Show this email to the ${esc(EVENT_NAME)} organisers to collect it.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- pickup location -->
          <tr>
            <td style="padding:16px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#12293f;border-radius:10px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:2px;padding-bottom:8px;">
                      📍 COLLECT IN ${esc(PICKUP.city).toUpperCase()}
                    </div>
                    <div style="color:#ffffff;font-size:15px;font-weight:700;padding-bottom:4px;">
                      ${esc(PICKUP.place)}
                    </div>
                    <div style="color:#a8c6e0;font-size:13px;line-height:1.6;padding-bottom:14px;">
                      ${esc(PICKUP.address)}
                    </div>
                    <a href="${esc(PICKUP.maps)}"
                       style="display:inline-block;background:#4aafff;color:#04121f;
                              font-size:13px;font-weight:700;text-decoration:none;
                              padding:11px 20px;border-radius:6px;">
                      View on Google Maps
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- what the game was about -->
          <tr>
            <td style="padding:22px 24px 0 24px;">
              <div style="color:#8fb8db;font-size:13px;line-height:1.7;">
                You beat all eight polluters - from the Trash Baron to the Greedy
                Tycoon - and gave the river back to the people who depend on it.
                Real rivers need the same thing: filtration, treatment, and
                someone willing to hold polluters to account.
              </div>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="padding:24px;">
              <div style="border-top:1px solid #1d3f66;padding-top:16px;
                          color:#5d7a94;font-size:11px;line-height:1.6;">
                ${esc(EVENT_NAME)} · Varanasi<br>
                You are getting this because you finished Level 8 with this email
                address. The prize is provided by the event organisers.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Plain-text alternative, for clients that refuse HTML.
function winnerText({ username, score, level, durationMs, rank }) {
  return [
    'CONGRATULATIONS, ' + (username || 'CHAMPION') + '!',
    '',
    'You cleared LEVEL 8 of ' + EVENT_NAME + ' and beat THE GREEDY TYCOON.',
    '',
    'Score : ' + score,
    'Time  : ' + fmtTime(durationMs),
    rank ? 'Rank  : #' + rank : '',
    '',
    'YOUR PRIZE: ' + PRIZE,
    'Show this email to the ' + EVENT_NAME + ' organisers to collect it.',
    '',
    'Collect in ' + PICKUP.city + ':',
    PICKUP.place,
    PICKUP.address,
    PICKUP.maps,
    '',
    'The prize is provided by the event organisers.',
  ].filter(Boolean).join('\n');
}

// The organisers' own alert. Deliberately separate from the player's mail:
// old accounts have no email address, and a send to the player can fail, but
// you still need to know the moment somebody finishes the game.
function alertHtml(o) {
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const row = (k, v) => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #1d3f66;color:#7fb0d8;
                 font-size:12px;white-space:nowrap;">${esc(k)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #1d3f66;color:#ffffff;
                 font-size:14px;font-weight:700;">${esc(v)}</td>
    </tr>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Level 8 cleared</title></head>
<body style="margin:0;padding:0;background:#0a1628;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#0a1628;padding:20px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:520px;background:#0e2038;border:1px solid #1d3f66;border-radius:12px;
                  font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow:hidden;">
      <tr>
        <td style="background:#0b2a4a;padding:20px 22px;">
          <div style="font-size:26px;line-height:1;">🏆</div>
          <div style="color:#ffd94a;font-size:18px;font-weight:700;padding-top:6px;">
            Somebody just finished the game
          </div>
          <div style="color:#8fb8db;font-size:12px;padding-top:4px;">
            ${esc(EVENT_NAME)} · Level 8 cleared
          </div>
        </td>
      </tr>
      <tr><td style="padding:6px 8px 10px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${row('Player', o.username || 'unknown')}
          ${row('Email', o.playerEmail || 'no email on this account')}
          ${row('Score', o.score)}
          ${row('Time', fmtTime(o.durationMs))}
          ${row('Rank', o.rank ? '#' + o.rank : 'not ranked yet')}
          ${row('Mode', o.mode || 'normal')}
          ${row('Finished', when + ' IST')}
        </table>
      </td></tr>
      <tr><td style="padding:0 22px 20px 22px;">
        <div style="color:${o.playerEmail ? '#7fc4a0' : '#ffb36b'};font-size:12px;line-height:1.6;">
          ${o.playerEmail
            ? 'The winner has been emailed their prize details.'
            : 'This account has no email address, so only you were notified. ' +
              'You will need to contact this player yourself.'}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Tells the organisers that somebody cleared level 8. Independent of whether
// the player themselves could be emailed.
async function sendOrganiserAlert(o) {
  const to = process.env.MAIL_TO || process.env.MAIL_USER;
  if (!mailerReady() || !to) return { sent: false, reason: 'not configured' };
  try {
    const info = await getTransport().sendMail({
      from: `"${EVENT_NAME}" <${process.env.MAIL_USER}>`,
      to,
      subject: `🏆 LEVEL 8 CLEARED by ${o.username || 'a player'} - score ${o.score}`,
      text: [
        'Somebody just cleared Level 8 of ' + EVENT_NAME + '.',
        '',
        'Player   : ' + (o.username || 'unknown'),
        'Email    : ' + (o.playerEmail || 'no email on this account'),
        'Score    : ' + o.score,
        'Time     : ' + fmtTime(o.durationMs),
        'Rank     : ' + (o.rank ? '#' + o.rank : 'not ranked yet'),
        'Mode     : ' + (o.mode || 'normal'),
        '',
        o.playerEmail
          ? 'The winner has been emailed their prize details.'
          : 'This account has no email address - you will need to contact them yourself.',
      ].join('\n'),
      html: alertHtml(o),
    });
    return { sent: true, id: info.messageId };
  } catch (e) {
    console.error('[mail] could not send organiser alert:', e.message);
    return { sent: false, reason: e.message };
  }
}

// Sends the winner mail. Never throws - a mail problem must not fail the run.
async function sendWinnerMail(opts) {
  if (!mailerReady()) {
    console.warn('[mail] MAIL_USER / MAIL_PASS not set - skipping winner email');
    return { sent: false, reason: 'not configured' };
  }
  if (!opts || !opts.to) return { sent: false, reason: 'no recipient' };

  try {
    const info = await getTransport().sendMail({
      from: `"${EVENT_NAME}" <${process.env.MAIL_USER}>`,
      to: opts.to,
      // no bcc here - the organisers get their own alert, which still arrives
      // when the player has no address or their send fails
      subject: `🏆 You beat ${EVENT_NAME}! ${PRIZE.replace(/^a /, 'A ')} is waiting for you`,
      text: winnerText(opts),
      html: winnerHtml(opts),
    });
    return { sent: true, id: info.messageId };
  } catch (e) {
    console.error('[mail] could not send winner email:', e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = {
  sendWinnerMail, sendOrganiserAlert,
  winnerHtml, winnerText, alertHtml,
  mailerReady, PICKUP, PRIZE, EVENT_NAME,
};
