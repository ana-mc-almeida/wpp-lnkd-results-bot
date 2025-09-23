const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

let GAMES = ["Zip", "Mini Sudoku", "Tango", "Queens"];
let MESSAGES_FETCH_LIMIT = 500;
let triggerString = "!results";
let inBotMessages = "Message sent by the bot.";

let results = [];

function parseMessage(msg, sender) {
  const gameRegex = /(Zip|Mini Sudoku|Tango|Queens)/;
  const numberRegex = /#?(\d+)/;
  const timeRegex = /(\d+:\d+)/;

  const game = msg.match(gameRegex)?.[1];
  const number = msg.match(numberRegex)?.[1];
  const time = msg.match(timeRegex)?.[1];

  if (game && number && time) {
    return { sender, game, number: parseInt(number), time };
  }
  return null;
}

function timeToSeconds(t) {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}

async function getMessages(chatId) {
  // console.log(`Fetching messages from chat ${chatId}...`);
  results = [];
  const chat = await client.getChatById(chatId);

  const messages = await chat.fetchMessages({ limit: MESSAGES_FETCH_LIMIT });

  const gamesIds = {};

  const now = new Date();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  for (const message of messages) {
    if (!message.timestamp || message.timestamp * 1000 < oneDayAgo) continue;
    if (message.body.includes(triggerString)) continue;
    if (message.body.includes(inBotMessages)) continue;

    let sender;
    if (message.from.endsWith(".us")) {
      const contact = await client.getContactById(message.author);
      sender = contact.pushname || contact.number;
    } else {
      const contact = await message.getContact();
      sender = contact.pushname || contact.number;
    }
    const parsed = parseMessage(message.body, sender);

    if (parsed) {
      const id = gamesIds[parsed.game];

      if (!id) {
        gamesIds[parsed.game] = parsed.number;
      } else if (parsed.number > gamesIds[parsed.game]) {
        gamesIds[parsed.game] = parsed.number;
      } else if (id > parsed.number) {
        continue; // FIXME: maybe this could be a break
      }

      results.push({
        sender: parsed.sender,
        game: parsed.game,
        number: parsed.number,
        time: parsed.time,
      });
    }
  }

  results = results.filter((r) => r.number === gamesIds[r.game]);
}

function generateDailySummary() {
  // console.log("Generating daily summary...");
  if (results.length === 0) return "No games played today.\n" + inBotMessages;

  let winners = {};
  let winCount = {};

  GAMES.forEach((game) => {
    const gameResults = results.filter((r) => r.game === game);
    if (gameResults.length > 0) {
      const winner = gameResults.reduce((a, b) =>
        timeToSeconds(a.time) < timeToSeconds(b.time) ? a : b
      );
      winners[game] = winner;
      winCount[winner.sender] = (winCount[winner.sender] || 0) + 1;
    }
  });

  let summary = "*Daily Summary:*\n";
  for (const game of GAMES) {
    if (winners[game]) {
      summary += `- *${game}* #${winners[game].number} Winner: ${winners[game].sender} (${winners[game].time})\n`;
    } else {
      summary += `- *${game}*: No games played.\n`;
    }
  }

  summary += "\n*Win Counts:*\n";
  for (const [sender, count] of Object.entries(winCount)) {
    summary += `- ${sender}: ${count} wins\n`;
  }

  summary += `\n${inBotMessages}`;

  return summary;
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message_create", async (message) => {
  if (message.body.toLowerCase().includes(triggerString)) {
    results = [];
    // console.log(`Trigger message received from ${message.from}`);
    const groupId = message.from.endsWith(".us") ? message.from : message.to;
    await getMessages(groupId);
    message.reply(generateDailySummary());
    // console.log(generateDailySummary());
    // console.log("Summary sent.\n");
  }
});

// console.log("Starting client...");
client.initialize();