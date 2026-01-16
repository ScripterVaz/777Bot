require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});


const VOUCH_CHANNEL_ID = process.env.VOUCH_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID || null; // optional per-guild command registration


if (!process.env.TOKEN || !VOUCH_CHANNEL_ID) {
  console.error('Missing TOKEN or VOUCH_CHANNEL_ID in .env');
  process.exit(1);
}


const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);


const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const VOUCHES_FILE = path.join(DATA_DIR, 'vouches.json');


function loadData(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([]));
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw || '[]');
}
function saveData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}


let PRODUCTS = loadData(PRODUCTS_FILE);
let VOUCHES = loadData(VOUCHES_FILE);


const BANNER_URL = 'https://i.imgur.com/GjIQdYt.png';
const NEON_GREEN = 0x39ff14;


function generateId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 9000 + 1000)}`;
}
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
         member.permissions.has(PermissionFlagsBits.ManageGuild) ||
         member.permissions.has(PermissionFlagsBits.ManageMessages);
}


client.once('ready', async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);


  // Clear old commands first to prevent duplicates
  try {
    await client.application.commands.set([]);
    if (GUILD_ID) {
      const guild = await client.guilds.fetch(GUILD_ID);
      await guild.commands.set([]);
      console.log('✅ Cleared old guild commands');
    }
    console.log('✅ Cleared old global commands');
  } catch (err) {
    console.error('Failed to clear old commands', err);
  }


  // ---------------- Commands ----------------
  const commands = [];


  // /vouch
  commands.push(
    new SlashCommandBuilder()
      .setName('vouch')
      .setDescription('Submit a vouch for a seller')
      .addUserOption(opt => opt.setName('seller').setDescription('Seller you vouch for').setRequired(true))
      .addStringOption(opt => opt.setName('rating').setDescription('Rating 1-5').setRequired(true)
        .addChoices(
          { name: '⭐ (1)', value: '1' },
          { name: '⭐⭐ (2)', value: '2' },
          { name: '⭐⭐⭐ (3)', value: '3' },
          { name: '⭐⭐⭐⭐ (4)', value: '4' },
          { name: '⭐⭐⭐⭐⭐ (5)', value: '5' }
        ))
      .addStringOption(opt => opt.setName('product').setDescription('Product/account name').setRequired(true))
      .addStringOption(opt => opt.setName('price').setDescription('Price paid (optional)').setRequired(false))
      .addStringOption(opt => opt.setName('message').setDescription('Comment (optional)').setRequired(false))
  );


  // /product
  commands.push(
    new SlashCommandBuilder()
      .setName('product')
      .setDescription('Show a product for sale (posts in current channel)')
      .addStringOption(opt => opt.setName('title').setDescription('Product title').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Product description').setRequired(true))
      .addStringOption(opt => opt.setName('features').setDescription('Comma-separated features').setRequired(true))
      .addStringOption(opt => opt.setName('price').setDescription('Product price text').setRequired(true))
      .addStringOption(opt => opt.setName('buy_link').setDescription('URL or channel ID / message link').setRequired(true))
      .addAttachmentOption(opt => opt.setName('image').setDescription('Upload product image').setRequired(false))
  );


  // /promo
  commands.push(
    new SlashCommandBuilder()
      .setName('promo')
      .setDescription('Post a short promo (image optional)')
      .addStringOption(opt => opt.setName('title').setDescription('Promo title').setRequired(true))
      .addStringOption(opt => opt.setName('content').setDescription('Short content').setRequired(true))
      .addAttachmentOption(opt => opt.setName('image').setDescription('Promo image').setRequired(false))
  );


  // Admin commands
  commands.push(
    new SlashCommandBuilder()
      .setName('featureproduct')
      .setDescription('(Admin) Toggle product featured by ID')
      .addStringOption(opt => opt.setName('id').setDescription('Product ID').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  );
  commands.push(
    new SlashCommandBuilder()
      .setName('removeproduct')
      .setDescription('(Admin) Remove a product by ID')
      .addStringOption(opt => opt.setName('id').setDescription('Product ID').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  );
  commands.push(
    new SlashCommandBuilder()
      .setName('removevouch')
      .setDescription('(Admin) Remove a vouch by ID')
      .addStringOption(opt => opt.setName('id').setDescription('Vouch ID').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  );
  commands.push(
    new SlashCommandBuilder()
      .setName('announce')
      .setDescription('(Admin) Post announcement in channel')
      .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(true))
      .addStringOption(opt => opt.setName('content').setDescription('Content').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  );
  commands.push(
    new SlashCommandBuilder()
      .setName('coupon-create')
      .setDescription('(Admin) Create discount coupon')
      .addStringOption(opt => opt.setName('code').setDescription('Coupon code').setRequired(true))
      .addIntegerOption(opt => opt.setName('percent').setDescription('% off').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  );


  // /help
  commands.push(
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show help about commands')
  );


  const commandJSON = commands.map(c => c.toJSON());


  try {
    if (GUILD_ID) {
      const guild = await client.guilds.fetch(GUILD_ID);
      await guild.commands.set(commandJSON);
      console.log('✅ Commands registered to guild', GUILD_ID);
    } else {
      await client.application.commands.set(commandJSON);
      console.log('✅ Global commands registered (may take up to 1h)');
    }
  } catch (err) {
    console.error('Command registration failed:', err);
  }
});


// ---------- Interaction handler ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;


  // ---------------- /vouch ----------------
  if (interaction.commandName === 'vouch') {
    await interaction.deferReply({ ephemeral: true });


    const sellerUser = interaction.options.getUser('seller');
    const ratingRaw = interaction.options.getString('rating');
    const productName = interaction.options.getString('product');
    const priceRaw = interaction.options.getString('price') || '';
    const message = interaction.options.getString('message') || '—';


    const rating = '⭐'.repeat(Math.max(1, Math.min(5, parseInt(ratingRaw))));
    const price = priceRaw ? `💰 ${priceRaw}` : '💰 —';


    const vouch = {
      id: generateId('v_'),
      authorId: interaction.user.id,
      sellerId: sellerUser.id,
      rating: Math.max(1, Math.min(5, parseInt(ratingRaw))),
      product: productName,
      price: priceRaw,
      message,
      timestamp: new Date().toISOString(),
    };
    VOUCHES.push(vouch);
    saveData(VOUCHES_FILE, VOUCHES);


    const embed = new EmbedBuilder()
      .setColor(NEON_GREEN)
      .setTitle('✅ New Vouch Submitted')
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .addFields(
        { name: '🧑 Seller', value: `<@${sellerUser.id}>`, inline: true },
        { name: '🌟 Rating', value: rating, inline: true },
        { name: '📦 Product', value: productName, inline: true },
        { name: '💰 Price', value: price, inline: true },
        { name: '💬 Comment', value: message, inline: false },
        { name: '🆔 Vouch ID', value: vouch.id, inline: true }
      )
      .setImage(BANNER_URL)
      .setTimestamp()
      .setFooter({ text: `Vouch by ${interaction.user.tag}` });


    try {
      const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
      await channel.send({ embeds: [embed] });
      await interaction.editReply('✅ Your vouch has been posted successfully!');
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed to post vouch — check bot permissions.');
    }
    return;
  }


  // ---------------- /product ----------------
  if (interaction.commandName === 'product') {
    await interaction.deferReply({ ephemeral: true });


    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const featuresRaw = interaction.options.getString('features');
    const price = interaction.options.getString('price');
    const buyLink = interaction.options.getString('buy_link');
    const attachment = interaction.options.getAttachment('image');


    const featuresArray = featuresRaw.split(',').map(s => `• ${s.trim()}`).slice(0, 20);
    const imageUrl = attachment?.url || BANNER_URL;


    let buyValue = buyLink;
    if (/^\d{17,19}$/.test(buyLink)) buyValue = `<#${buyLink}>`;
    else if (/^https?:\/\//.test(buyLink)) buyValue = `[Buy Here](${buyLink})`;


    const product = {
      id: generateId('p_'),
      title,
      description,
      features: featuresArray,
      price,
      buyLinkRaw: buyLink,
      imageUrl,
      authorId: interaction.user.id,
      timestamp: new Date().toISOString(),
      featured: false,
    };
    PRODUCTS.push(product);
    saveData(PRODUCTS_FILE, PRODUCTS);


    const embed = new EmbedBuilder()
      .setColor(NEON_GREEN)
      .setTitle(`🛒 ${title}${product.featured ? ' ⭐ Featured' : ''}`)
      .setDescription(description)
      .addFields(
        { name: '✨ Features', value: featuresArray.join('\n') || '—', inline: false },
        { name: '💰 Price', value: price, inline: true },
        { name: '🛒 Buy Here', value: buyValue, inline: true },
        { name: '🆔 Product ID', value: product.id, inline: true }
      )
      .setImage(imageUrl)
      .setTimestamp()
      .setFooter({ text: `Product posted by ${interaction.user.tag}` });


    try {
      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply(`✅ Product posted successfully! (ID: ${product.id})`);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed to post product — check bot permissions.');
    }
    return;
  }


  // ---------------- /promo ----------------
  if (interaction.commandName === 'promo') {
    await interaction.deferReply({ ephemeral: true });


    const title = interaction.options.getString('title');
    const content = interaction.options.getString('content');
    const attachment = interaction.options.getAttachment('image');
    const imageUrl = attachment?.url || BANNER_URL;


    const embed = new EmbedBuilder()
      .setColor(NEON_GREEN)
      .setTitle(`🚀 ${title}`)
      .setDescription(content)
      .setImage(imageUrl)
      .setTimestamp()
      .setFooter({ text: `Promo by ${interaction.user.tag}` });


    try {
      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply('✅ Promo posted!');
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed to post promo — check bot permissions.');
    }
    return;
  }


  // ---------------- Admin commands ----------------
  if (interaction.commandName === 'featureproduct') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply('❌ Admin required.');
    const id = interaction.options.getString('id');
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return interaction.editReply('❌ Product not found.');
    p.featured = !p.featured;
    saveData(PRODUCTS_FILE, PRODUCTS);
    await interaction.editReply(`✅ Product ${p.featured ? 'featured' : 'unfeatured'} (ID: ${p.id})`);
    return;
  }


  if (interaction.commandName === 'removeproduct') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply('❌ Admin required.');
    const id = interaction.options.getString('id');
    const idx = PRODUCTS.findIndex(x => x.id === id);
    if (idx === -1) return interaction.editReply('❌ Product not found.');
    PRODUCTS.splice(idx, 1);
    saveData(PRODUCTS_FILE, PRODUCTS);
    await interaction.editReply('✅ Product removed.');
    return;
  }


  if (interaction.commandName === 'removevouch') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply('❌ Admin required.');
    const id = interaction.options.getString('id');
    const idx = VOUCHES.findIndex(x => x.id === id);
    if (idx === -1) return interaction.editReply('❌ Vouch not found.');
    VOUCHES.splice(idx, 1);
    saveData(VOUCHES_FILE, VOUCHES);
    await interaction.editReply('✅ Vouch removed.');
    return;
  }


  if (interaction.commandName === 'announce') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply('❌ Admin required.');
    const title = interaction.options.getString('title');
    const content = interaction.options.getString('content');
    const embed = new EmbedBuilder()
      .setColor(NEON_GREEN)
      .setTitle(`📢 ${title}`)
      .setDescription(content)
      .setImage(BANNER_URL)
      .setTimestamp()
      .setFooter({ text: `Announcement by ${interaction.user.tag}` });


    try {
      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply('✅ Announcement posted.');
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ Failed — check permissions.');
    }
    return;
  }


  if (interaction.commandName === 'coupon-create') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply('❌ Admin required.');
    const code = interaction.options.getString('code').toUpperCase();
    const percent = interaction.options.getInteger('percent');
    if (percent <= 0 || percent > 100) return interaction.editReply('❌ Percent must be 1-100.');
    const coupon = { id: generateId('c_'), code, percent, createdBy: interaction.user.id, createdAt: new Date().toISOString() };
    // optional: store coupons in JSON if needed
    await interaction.editReply(`✅ Coupon created: \`${code}\` — ${percent}% off`);
    return;
  }


  // ---------------- /help ----------------
  if (interaction.commandName === 'help') {
    await interaction.deferReply({ ephemeral: true });
    const embed = new EmbedBuilder()
      .setColor(NEON_GREEN)
      .setTitle('🆘 Bot Help')
      .setDescription(
        '**/vouch** — Submit a seller vouch\n' +
        '**/product** — Post a product with optional image\n' +
        '**/promo** — Short promotional post\n' +
        '**/featureproduct** — Admin: feature product\n' +
        '**/removeproduct** — Admin: remove product\n' +
        '**/removevouch** — Admin: remove vouch\n' +
        '**/announce** — Admin: post announcement\n' +
        '**/coupon-create** — Admin: create discount coupon\n' +
        '**/help** — Show this help embed'
      )
      .setFooter({ text: 'Neon Green Marketplace Bot' });
    await interaction.editReply({ embeds: [embed] });
    return;
  }


  await interaction.reply({ content: 'Command not implemented.', ephemeral: true });
});


// Login
client.login(process.env.TOKEN).catch(err => console.error('Login failed:', err));