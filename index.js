require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const mongoose = require('mongoose');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

/* ===========================
   BANCO DE DADOS
=========================== */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ Banco conectado"))
.catch(console.error);

const userSchema = new mongoose.Schema({
    userId: String,
    elo: { type: Number, default: 1000 },
    eloPendente: { type: Number, default: null },
    verificado: { type: Boolean, default: false },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

async function getUser(id) {
    let user = await User.findOne({ userId: id });
    if (!user) user = await User.create({ userId: id });
    return user;
}

/* ===========================
   SISTEMA DE PATENTE
=========================== */

function getPatente(elo) {
    if (elo >= 1900) return "☀️ Radiante";
    if (elo >= 1700) return "👑 Imortal";
    if (elo >= 1500) return "🔥 Diamante";
    if (elo >= 1300) return "💎 Platina";
    if (elo >= 1100) return "🥇 Ouro";
    if (elo >= 900) return "🥈 Prata";
    return "🥉 Bronze";
}

/* ===========================
   FILA
=========================== */

let fila = [];
let partidaAtual = null;

/* ===========================
   REGISTRO AUTOMÁTICO DE COMANDOS
=========================== */

client.once('ready', async () => {

    console.log(`🤖 Logado como ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('setelo')
            .setDescription('Solicitar alteração de ELO')
            .addIntegerOption(option =>
                option.setName('valor')
                .setDescription('Novo ELO')
                .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('verificar')
            .setDescription('Verificar ELO de usuário')
            .addUserOption(option =>
                option.setName('usuario')
                .setDescription('Usuário')
                .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('perfil')
            .setDescription('Ver seu perfil'),

        new SlashCommandBuilder()
            .setName('ranking')
            .setDescription('Ver ranking'),

        new SlashCommandBuilder()
            .setName('fila')
            .setDescription('Abrir fila 5v5')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        console.log("✅ Slash commands registrados.");
    } catch (err) {
        console.error(err);
    }
});

/* ===========================
   INTERAÇÕES
=========================== */

client.on('interactionCreate', async interaction => {

    if (interaction.isChatInputCommand()) {

        const { commandName, user } = interaction;
        const dbUser = await getUser(user.id);

        if (commandName === 'setelo') {

            const valor = interaction.options.getInteger('valor');

            if (valor < 0 || valor > 5000)
                return interaction.reply({ content: "ELO inválido.", ephemeral: true });

            dbUser.eloPendente = valor;
            dbUser.verificado = false;
            await dbUser.save();

            return interaction.reply("🔎 Seu ELO foi enviado para verificação.");
        }

        if (commandName === 'verificar') {

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return interaction.reply({ content: "Apenas administradores.", ephemeral: true });

            const alvo = interaction.options.getUser('usuario');
            const targetUser = await getUser(alvo.id);

            if (!targetUser.eloPendente)
                return interaction.reply("Usuário não possui ELO pendente.");

            targetUser.elo = targetUser.eloPendente;
            targetUser.eloPendente = null;
            targetUser.verificado = true;
            await targetUser.save();

            return interaction.reply(`✅ ELO de <@${alvo.id}> verificado.`);
        }

        if (commandName === 'perfil') {

            return interaction.reply(
`🏅 Patente: ${getPatente(dbUser.elo)}
📊 ELO: ${dbUser.elo}
🛡️ Verificado: ${dbUser.verificado ? "Sim" : "Não"}
🏆 Vitórias: ${dbUser.wins}
❌ Derrotas: ${dbUser.losses}`
            );
        }

        if (commandName === 'ranking') {

            const top = await User.find().sort({ elo: -1 }).limit(10);

            const embed = new EmbedBuilder()
                .setTitle("🏆 RANKING")
                .setDescription(
                    top.map((u, i) =>
                        `#${i+1} ${getPatente(u.elo)} <@${u.userId}> — ${u.elo}`
                    ).join("\n") || "Sem jogadores."
                );

            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'fila') {

            const embed = new EmbedBuilder()
                .setTitle("🎮 FILA 5v5")
                .setDescription(`Jogadores: ${fila.length}/10`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('entrar')
                    .setLabel('Entrar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('sair')
                    .setLabel('Sair')
                    .setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    /* BOTÕES */

    if (interaction.isButton()) {

        const user = interaction.user;
        const dbUser = await getUser(user.id);

        if (!dbUser.verificado)
            return interaction.reply({ content: "Você precisa ter ELO verificado.", ephemeral: true });

        if (interaction.customId === 'entrar') {

            if (fila.includes(user.id))
                return interaction.reply({ content: "Você já está na fila.", ephemeral: true });

            fila.push(user.id);

            if (fila.length === 10)
                return iniciarPartida(interaction);

            return interaction.reply({ content: `Entrou na fila (${fila.length}/10)`, ephemeral: true });
        }

        if (interaction.customId === 'sair') {
            fila = fila.filter(id => id !== user.id);
            return interaction.reply({ content: "Saiu da fila.", ephemeral: true });
        }

        if (interaction.customId === 'time1_win' || interaction.customId === 'time2_win') {

            if (!partidaAtual) return;

            const vencedor = interaction.customId === 'time1_win'
                ? partidaAtual.time1
                : partidaAtual.time2;

            const perdedor = interaction.customId === 'time1_win'
                ? partidaAtual.time2
                : partidaAtual.time1;

            for (let id of vencedor) {
                const u = await getUser(id);
                u.wins++;
                u.elo += 20;
                await u.save();
            }

            for (let id of perdedor) {
                const u = await getUser(id);
                u.losses++;
                u.elo -= 20;
                await u.save();
            }

            partidaAtual = null;

            return interaction.reply("🏁 Resultado registrado.");
        }
    }
});

/* ===========================
   INICIAR PARTIDA
=========================== */

async function iniciarPartida(interaction) {

    const jogadores = await Promise.all(fila.map(id => getUser(id)));
    jogadores.sort((a, b) => b.elo - a.elo);

    const time1 = [];
    const time2 = [];

    jogadores.forEach((j, i) => {
        if (i % 2 === 0) time1.push(j.userId);
        else time2.push(j.userId);
    });

    fila = [];
    partidaAtual = { time1, time2 };

    const embed = new EmbedBuilder()
        .setTitle("⚔️ TIMES FORMADOS")
        .addFields(
            { name: "🔵 Time 1", value: time1.map(id => `<@${id}>`).join("\n"), inline: true },
            { name: "🔴 Time 2", value: time2.map(id => `<@${id}>`).join("\n"), inline: true }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('time1_win')
            .setLabel('Time 1 Venceu')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('time2_win')
            .setLabel('Time 2 Venceu')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
}

/* ===========================
   LOGIN
=========================== */

client.login(process.env.TOKEN);