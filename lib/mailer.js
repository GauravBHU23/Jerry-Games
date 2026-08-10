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

// The eight stages and the polluter running each one, so the mail can show
// the whole journey rather than just the last fight.
const LEVELS = [
  { n: 1, name: 'THE RIVERBANK',    boss: 'THE TRASH BARON' },
  { n: 2, name: 'THE OLD CANAL',    boss: 'DRUM WARDEN' },
  { n: 3, name: 'THE DEAD MARSH',   boss: 'SLUDGE BARGE' },
  { n: 4, name: 'DRONE PATROL',     boss: 'DRONE MARSHAL' },
  { n: 5, name: 'THE PIPE WORKS',   boss: 'PIPE FOREMAN' },
  { n: 6, name: 'TOXIC OUTFALL',    boss: 'TOXIC BARON' },
  { n: 7, name: 'THE SMOG BELT',    boss: 'SMOG GENERAL' },
  { n: 8, name: 'THE TYCOON TOWER', boss: 'THE GREEDY TYCOON' },
];

// Animation in email is a bonus, never the design. Gmail and Apple Mail run
// these; Outlook ignores @keyframes entirely, so every animated element is
// styled to look finished in its resting state and the motion only adds to it.
const ANIM_CSS = `
    @keyframes jerryPop {
      0%   { transform: scale(0.6); opacity: 0; }
      60%  { transform: scale(1.12); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes jerryGlow {
      0%, 100% { text-shadow: 0 0 12px rgba(255,217,74,0.55); }
      50%      { text-shadow: 0 0 26px rgba(255,217,74,0.95); }
    }
    @keyframes jerryRise {
      from { transform: translateY(10px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes jerryShine {
      from { background-position: -240px 0; }
      to   { background-position: 240px 0; }
    }
    .pop   { animation: jerryPop 700ms cubic-bezier(.2,.9,.3,1.3) both; }
    .glow  { animation: jerryGlow 2.4s ease-in-out infinite; }
    .rise  { animation: jerryRise 600ms ease-out both; }
    .rise2 { animation: jerryRise 600ms ease-out 140ms both; }
    .rise3 { animation: jerryRise 600ms ease-out 280ms both; }
    .shine {
      background-image: linear-gradient(100deg,
        rgba(255,255,255,0) 30%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 70%);
      background-size: 240px 100%;
      background-repeat: no-repeat;
      animation: jerryShine 3.2s linear infinite;
    }
    /* phones: stack the stat columns and ease the padding */
    @media only screen and (max-width: 480px) {
      .stat  { display: block !important; width: 100% !important;
               border-right: 0 !important; border-bottom: 1px solid #0e2038 !important; }
      .pad   { padding-left: 16px !important; padding-right: 16px !important; }
      .h1    { font-size: 24px !important; }
      .lvl   { font-size: 10px !important; }
    }
    /* respect a reader who has asked for less motion */
    @media (prefers-reduced-motion: reduce) {
      .pop, .glow, .rise, .rise2, .rise3, .shine { animation: none !important; }
    }`;

// One row of the level-by-level journey.
function levelRow(l, reached) {
  const done = l.n <= reached;
  return `
    <tr>
      <td width="34" align="center" style="padding:7px 0;">
        <div style="width:22px;height:22px;line-height:22px;border-radius:11px;
                    font-size:11px;font-weight:700;
                    background:${done ? '#1c5e3a' : '#152c46'};
                    color:${done ? '#7ff0b0' : '#4a6b84'};">
          ${done ? '&#10003;' : l.n}
        </div>
      </td>
      <td style="padding:7px 8px;">
        <span class="lvl" style="color:${done ? '#cfe9ff' : '#5d7a94'};
              font-size:12px;font-weight:${done ? '700' : '400'};">
          LEVEL ${l.n} &#183; ${esc(l.name)}
        </span>
      </td>
      <td align="right" style="padding:7px 0;">
        <span class="lvl" style="color:${done ? '#ff9b9b' : '#4a6b84'};font-size:11px;">
          ${esc(l.boss)}
        </span>
      </td>
    </tr>`;
}

// A single-column table layout, because that is what survives Gmail, Outlook
// and every phone client - flexbox and grid do not.
function winnerHtml({ username, score, level, durationMs, rank }) {
  const name = esc(username || 'CHAMPION');
  const reached = Math.max(1, Math.min(8, Number(level) || 8));
  const journey = LEVELS.map(l => levelRow(l, reached)).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>You beat ${esc(EVENT_NAME)}!</title>
<style>${ANIM_CSS}</style>
</head>
<body style="margin:0;padding:0;background:#070f1e;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    All 8 levels cleared. The Greedy Tycoon has fallen - your prize is waiting in Varanasi.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#070f1e;padding:22px 10px;">
    <tr>
      <td align="center">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:620px;background:#0e2038;border-radius:16px;overflow:hidden;
                      border:1px solid #244a76;box-shadow:0 18px 50px rgba(0,0,0,0.55);
                      font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <!-- hero -->
          <tr>
            <td align="center" class="pad shine"
                style="background:#0b2a4a;
                       background-image:linear-gradient(160deg,#123a63 0%,#0b2445 55%,#0d1c33 100%);
                       padding:38px 28px 30px 28px;border-bottom:1px solid #244a76;">
              <div class="pop" style="font-size:56px;line-height:1;margin-bottom:6px;">&#127942;</div>
              <div class="rise" style="color:#7fd4ff;font-size:11px;letter-spacing:4px;
                          font-weight:700;padding-bottom:8px;">
                CHAMPION OF THE RIVER
              </div>
              <h1 class="h1 glow" style="margin:0;color:#ffd94a;font-size:32px;line-height:1.2;
                         letter-spacing:1px;font-weight:800;">
                CONGRATULATIONS!
              </h1>
              <div class="rise2" style="color:#eaf6ff;font-size:19px;font-weight:700;padding-top:14px;">
                ${name}
              </div>
              <div class="rise2" style="color:#9fc6e8;font-size:14px;line-height:1.6;padding-top:6px;">
                You cleared all 8 levels and gave the river back.
              </div>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     width="100%" style="max-width:340px;margin-top:20px;">
                <tr>
                  <td style="background:#0a1c31;border-radius:20px;padding:4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td class="rise3" align="center"
                            style="background:#1f8f52;
                                   background-image:linear-gradient(90deg,#1f8f52,#39d17e);
                                   border-radius:16px;padding:7px 0;
                                   color:#04121f;font-size:11px;font-weight:800;letter-spacing:2px;">
                          8 / 8 LEVELS COMPLETE
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- stats -->
          <tr>
            <td class="pad" style="padding:24px 24px 6px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#12293f;border-radius:12px;overflow:hidden;">
                <tr>
                  <td class="stat rise" width="33%" align="center"
                      style="padding:16px 6px;border-right:1px solid #0e2038;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:2px;">SCORE</div>
                    <div style="color:#ffffff;font-size:22px;font-weight:800;padding-top:5px;">
                      ${esc(score)}
                    </div>
                  </td>
                  <td class="stat rise2" width="33%" align="center"
                      style="padding:16px 6px;border-right:1px solid #0e2038;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:2px;">TIME</div>
                    <div style="color:#9fe8c4;font-size:22px;font-weight:800;padding-top:5px;">
                      ${fmtTime(durationMs)}
                    </div>
                  </td>
                  <td class="stat rise3" width="33%" align="center" style="padding:16px 6px;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:2px;">RANK</div>
                    <div style="color:#ffd94a;font-size:22px;font-weight:800;padding-top:5px;">
                      ${rank ? '#' + esc(rank) : '&#8212;'}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- the journey -->
          <tr>
            <td class="pad" style="padding:22px 24px 0 24px;">
              <div style="color:#7fd4ff;font-size:11px;letter-spacing:3px;font-weight:700;
                          padding-bottom:10px;">
                YOUR RUN, LEVEL BY LEVEL
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#0c1e33;border:1px solid #1d3f66;border-radius:12px;">
                <tr><td style="padding:6px 14px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${journey}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>

          <!-- prize -->
          <tr>
            <td class="pad" style="padding:22px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1d1405;
                            background-image:linear-gradient(135deg,#241a06,#15100a);
                            border:2px solid #b8912a;border-radius:12px;">
                <tr>
                  <td class="rise" style="padding:22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:34px;line-height:1;padding-right:12px;
                                   vertical-align:middle;">&#127829;</td>
                        <td style="vertical-align:middle;">
                          <div style="color:#ffd94a;font-size:19px;font-weight:800;">
                            Your prize: ${esc(PRIZE)}
                          </div>
                          <div style="color:#d8c9a4;font-size:13px;padding-top:3px;">
                            Won by finishing ${esc(EVENT_NAME)}
                          </div>
                        </td>
                      </tr>
                    </table>
                    <div style="color:#e8dcc0;font-size:14px;line-height:1.65;padding-top:14px;
                                border-top:1px solid #4a3d13;margin-top:14px;">
                      Show this email to the organisers to collect it.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- pickup -->
          <tr>
            <td class="pad" style="padding:16px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#12293f;border-radius:12px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="color:#7fb0d8;font-size:10px;letter-spacing:2px;padding-bottom:9px;">
                      &#128205; COLLECT IN ${esc(PICKUP.city).toUpperCase()}
                    </div>
                    <div style="color:#ffffff;font-size:16px;font-weight:700;padding-bottom:5px;">
                      ${esc(PICKUP.place)}
                    </div>
                    <div style="color:#a8c6e0;font-size:13px;line-height:1.65;padding-bottom:16px;">
                      ${esc(PICKUP.address)}
                    </div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:#4aafff;
                                   background-image:linear-gradient(90deg,#4aafff,#7fd4ff);
                                   border-radius:8px;">
                          <a href="${esc(PICKUP.maps)}"
                             style="display:inline-block;color:#04121f;font-size:13px;
                                    font-weight:800;text-decoration:none;padding:12px 22px;
                                    letter-spacing:.5px;">
                            View on Google Maps &#8594;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- the point -->
          <tr>
            <td class="pad" style="padding:22px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-left:3px solid #2f6f9c;background:#0c1e33;border-radius:0 10px 10px 0;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="color:#9fc6e8;font-size:13px;line-height:1.75;">
                      You beat all eight polluters &#8212; from the Trash Baron to the
                      Greedy Tycoon &#8212; and gave the river back to the people who
                      depend on it. Real rivers need the same three things:
                      <b style="color:#cfe9ff;">filtration</b>,
                      <b style="color:#cfe9ff;">treatment</b>, and someone willing to
                      <b style="color:#cfe9ff;">hold polluters to account</b>.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td class="pad" style="padding:24px;">
              <div style="border-top:1px solid #1d3f66;padding-top:16px;
                          color:#5d7a94;font-size:11px;line-height:1.7;">
                <b style="color:#7fb0d8;">${esc(EVENT_NAME)}</b> &#183; Varanasi<br>
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
    'YOUR RUN:',
    ...LEVELS.map(l => '  [x] LEVEL ' + l.n + ' - ' + l.name + '  (' + l.boss + ')'),
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
          ${row('Level', 'LEVEL ' + (o.level || 8) + ' - ' +
                 ((LEVELS[(Number(o.level) || 8) - 1] || {}).name || 'THE TYCOON TOWER'))}
          ${row('Final boss', (LEVELS[(Number(o.level) || 8) - 1] || {}).boss || 'THE GREEDY TYCOON')}
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
        'Level    : LEVEL ' + (o.level || 8) + ' - ' +
                   ((LEVELS[(Number(o.level) || 8) - 1] || {}).name || 'THE TYCOON TOWER'),
        'Boss     : ' + ((LEVELS[(Number(o.level) || 8) - 1] || {}).boss || 'THE GREEDY TYCOON'),
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
