const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ====== SISTEMA ======
let filas = {};
let ranking = {};
let partidasAtivas = {};
let imagemPainel = "https://i.imgur.com/9QO3K8X.png"; // Imagem padrão VAVA FARM

// ===== RESET MENSAL AUTOMÁTICO =====
let ultimoResetMes = null;

function verificarResetMensal() {
  const agora = new Date();
  const dia = agora.getDate();
  const mes = agora.getMonth();
  const ano = agora.getFullYear();

  const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();

  if (dia === ultimoDiaMes) {
    if (ultimoResetMes !== mes) {
      ranking = {};
      ultimoResetMes = mes;
      console.log("🔄 RANKING RESETADO AUTOMATICAMENTE (Fim do mês)");
    }
  }

  if (dia === 1) {
    ultimoResetMes = null;
  }
}

setInterval(verificarResetMensal, 60 * 60 * 1000);

// ===== BOT ONLINE =====
client.once(Events.ClientReady, () => {
  console.log(`🔥 VAVA FARM ONLINE: ${client.user.tag}`);
});

// ===== COMANDOS =====
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const cmd = args[0].toLowerCase();

  // Criar fila
  if (cmd === "!criarfila") {
    if (!message.member.permissions.has("Administrator"))
      return message.reply("Apenas admin pode criar filas.");

    const nome = args[1];
    const cor = args[2] || "#ff0000";
    const imagem = args[3] || imagemPainel;

    if (!nome) return message.reply("Informe o nome da fila.");
    if (filas[nome]) return message.reply("Fila já existe.");

    filas[nome] = {
      jogadores: [],
      cor: cor,
      imagem: imagem
    };

    message.channel.send(`✅ Fila ${nome} criada com sucesso.`);
  }

  // Alterar imagem geral do painel
  if (cmd === "!setpainel") {
    if (!message.member.permissions.has("Administrator"))
      return message.reply("Apenas admin.");

    const url = args[1];
    if (!url) return message.reply("Envie URL da imagem.");

    imagemPainel = url;
    message.channel.send("✅ Imagem geral do painel atualizada.");
  }

  // Alterar cor da fila
  if (cmd === "!setcor") {
    if (!message.member.permissions.has("Administrator"))
      return message.reply("Apenas admin.");

    const nome = args[1];
    const cor = args[2];
    if (!filas[nome]) return message.reply("Fila não existe.");

    filas[nome].cor = cor;
    message.channel.send("🎨 Cor da fila atualizada.");
  }

  // Alterar imagem da fila
  if (cmd === "!setimagem") {
    if (!message.member.permissions.has("Administrator"))
      return message.reply("Apenas admin.");

    const nome = args[1];
    const url = args[2];
    if (!filas[nome]) return message.reply("Fila não existe.");

    filas[nome].imagem = url;
    message.channel.send("🖼️ Imagem da fila atualizada.");
  }

  // Painel principal
  if (cmd === "!painel") {
    if (Object.keys(filas).length === 0)
      return message.reply("Nenhuma fila criada.");

    const row = new ActionRowBuilder();

    Object.keys(filas).forEach(nome => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(nome)
          .setLabel(nome.toUpperCase())
          .setStyle(ButtonStyle.Danger)
      );
    });

    row.addComponents(
      new ButtonBuilder()
        .setCustomId("sair")
        .setLabel("SAIR")
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setTitle("🔥 VAVA FARM - FILAS COMPETITIVAS")
      .setDescription("Entre na fila e desafie um adversário!")
      .setColor("#ff0000")
      .setImage(imagemPainel)
      .setFooter({ text: "Sistema oficial VAVA FARM" });

    message.channel.send({ embeds: [embed], components: [row] });
  }

  // Registrar resultado
  if (cmd === "!resultado") {
    if (!message.member.permissions.has("Administrator"))
      return message.reply("Apenas admin pode registrar.");

    const vencedor = message.mentions.users.first();
    if (!vencedor) return message.reply("Mencione o vencedor.");

    let filaEncontrada = null;
    let jogadores = null;

    for (let nome in partidasAtivas) {
      if (partidasAtivas[nome].includes(vencedor.id)) {
        filaEncontrada = nome;
        jogadores = partidasAtivas[nome];
        break;
      }
    }

    if (!filaEncontrada)
      return message.reply("Nenhuma partida ativa encontrada.");

    const perdedor = jogadores.find(id => id !== vencedor.id);

    if (!ranking[vencedor.id]) ranking[vencedor.id] = { wins: 0, losses: 0 };
    if (!ranking[perdedor]) ranking[perdedor] = { wins: 0, losses: 0 };

    ranking[vencedor.id].wins += 1;
    ranking[vencedor.id].losses = ranking[vencedor.id].losses || 0;

    ranking[perdedor].losses += 1;
    ranking[perdedor].wins = ranking[perdedor].wins || 0;

    delete partidasAtivas[filaEncontrada];

    message.channel.send(
      `🏆 RESULTADO REGISTRADO\n\nVencedor: <@${vencedor.id}>\nPerdedor: <@${perdedor}>`
    );
  }

  // Ranking
  if (cmd === "!rank") {
    if (Object.keys(ranking).length === 0)
      return message.channel.send("Ranking vazio.");

    const top = Object.entries(ranking)
      .sort((a, b) => b[1].wins - a[1].wins)
      .slice(0, 10);

    const lista = top
      .map(([id, stats], i) =>
        `${i + 1}. <@${id}> - ${stats.wins}W`
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🏆 RANKING VAVA FARM")
      .setDescription(lista)
      .setColor("#ff0000")
      .setImage(imagemPainel);

    message.channel.send({ embeds: [embed] });
  }
});

// ===== BOTÕES =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  // Remove usuário de todas filas
  Object.keys(filas).forEach(f => {
    filas[f].jogadores =
      filas[f].jogadores.filter(id => id !== userId);
  });

  if (interaction.customId !== "sair") {

    const fila = filas[interaction.customId];
    fila.jogadores.push(userId);

    await interaction.reply({
      content: `Você entrou na fila ${interaction.customId}`,
      ephemeral: true
    });

    if (fila.jogadores.length === 2) {

      const jogadores = fila.jogadores;
      partidasAtivas[interaction.customId] = jogadores;

      const embed = new EmbedBuilder()
        .setTitle(`🔥 CONFRONTO - ${interaction.customId}`)
        .setDescription(`<@${jogadores[0]}> 🆚 <@${jogadores[1]}>\n\nApós a partida, admin use:\n!resultado @vencedor`)
        .setColor(fila.cor)
        .setImage(fila.imagem);

      interaction.channel.send({ embeds: [embed] });

      fila.jogadores = [];
    }

  } else {
    await interaction.reply({
      content: "Você saiu da fila.",
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);