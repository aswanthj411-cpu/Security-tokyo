const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');

// --------------------------- CONFIG ---------------------------
const TOKEN = process.env.TOKEN; // Your bot token in Railway/Replit
const LOG_CHANNEL_ID = "1475805554726273034"; // Mod-log channel ID
const OWNERS = ["1405447087423885312"]; // IDs of trusted owners

// Bad words list
const BAD_WORDS = ["punda", "sunni", "thevudiya", "gommala"];

// Spam / timeout settings
const MESSAGE_REPEAT_LIMIT = 5; // same message
const MESSAGE_REPEAT_TIME = 15 * 1000; // 15 seconds
const CHANNEL_SPAM_LIMIT = 5; // channels
const CHANNEL_SPAM_TIME = 10 * 1000; // 10 seconds
const TIMEOUT_DURATION = 10 * 60 * 1000; // 10 minutes

// --------------------------- CLIENT ---------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// Load cache
let cache = JSON.parse(fs.readFileSync("cache.json", "utf8"));

// --------------------------- HELPER ---------------------------
function saveCache() {
  fs.writeFileSync("cache.json", JSON.stringify(cache, null, 2));
}

// --------------------------- BOT READY ---------------------------
client.once("ready", () => {
  console.log(`✅ Security Bot Online as ${client.user.tag}`);
});

// --------------------------- MESSAGE EVENT ---------------------------
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
  const content = message.content.toLowerCase();
  const userId = message.author.id;
  const now = Date.now();

  // ----- 1️⃣ BAD WORDS -----
  if (BAD_WORDS.some(word => content.includes(word))) {
    try {
      await message.member.timeout(TIMEOUT_DURATION, "Used bad word");
      if (logChannel) logChannel.send(`⛔ ${message.member.user.tag} timed out for bad word: "${message.content}"`);
      return;
    } catch(err){ console.log(err); }
  }

  // ----- 2️⃣ REPEATED MESSAGE SPAM -----
  if (!cache.messageCache[userId]) cache.messageCache[userId] = [];
  cache.messageCache[userId].push({ content, time: now });

  // Remove old messages
  cache.messageCache[userId] = cache.messageCache[userId].filter(msg => now - msg.time <= MESSAGE_REPEAT_TIME);

  const count = cache.messageCache[userId].filter(msg => msg.content === content).length;
  if (count >= MESSAGE_REPEAT_LIMIT) {
    try {
      await message.member.timeout(TIMEOUT_DURATION, "Repeated message spam");
      if (logChannel) logChannel.send(`⛔ ${message.member.user.tag} timed out for repeated spam: "${content}"`);
      cache.messageCache[userId] = []; // reset
      return;
    } catch(err){ console.log(err); }
  }

  // ----- 3️⃣ LINK DETECTION -----
  const linkRegex = /(https?:\/\/[^\s]+)/gi;
  if (linkRegex.test(content)) {
    try {
      await message.member.timeout(TIMEOUT_DURATION, "Sent a link in chat");
      if (logChannel) logChannel.send(`⛔ ${message.member.user.tag} timed out for sending a link: "${message.content}"`);
      return;
    } catch(err){ console.log(err); }
  }

  saveCache();
});

// --------------------------- CHANNEL CREATION EVENT ---------------------------
client.on("channelCreate", async channel => {
  const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
  const guildId = channel.guild.id;

  // Get creator from cache/AuditLog
  const audit = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 });
  const entry = audit.entries.first();
  const creator = entry ? entry.executor : null;

  if (!cache.channelCreationCache[guildId]) cache.channelCreationCache[guildId] = [];
  if (creator) cache.channelCreationCache[guildId].push({ time: Date.now(), creator: creator.id });

  // Remove old entries
  cache.channelCreationCache[guildId] = cache.channelCreationCache[guildId].filter(c => Date.now() - c.time <= CHANNEL_SPAM_TIME);

  const userChannels = cache.channelCreationCache[guildId].filter(c => c.creator === creator?.id);
  if (userChannels.length >= CHANNEL_SPAM_LIMIT && creator) {
    try {
      const member = channel.guild.members.cache.get(creator.id);
      if(member){
        await member.ban({ reason: "Channel spam detected" });
        if (logChannel) logChannel.send(`🚨 ${member.user.tag} banned for creating ${CHANNEL_SPAM_LIMIT}+ channels in ${CHANNEL_SPAM_TIME/1000}s`);
      }
      cache.channelCreationCache[guildId] = cache.channelCreationCache[guildId].filter(c => c.creator !== creator.id);
    } catch(err){ console.log(err); }
  }

  saveCache();
});

// --------------------------- MEMBER JOIN EVENT (BOT PROTECTION) ---------------------------
client.on("guildMemberAdd", async member => {
  const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (member.user.bot && !OWNERS.includes(member.user.id)) {
    try {
      await member.ban({ reason: "Unauthorized bot added" });
      if (logChannel) logChannel.send(`🚨 Unauthorized bot ${member.user.tag} was banned automatically`);
    } catch(err){ console.log(err); }
  }
});

// --------------------------- LOGIN ---------------------------
client.login(TOKEN);
