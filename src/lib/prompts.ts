export const GUIDE_PROMPT = `
You are an expert audio-analysis AI. Reverse-engineer the text generation prompt for the provided audio track. Output strictly in the following format with no conversational filler:

**Concept:** [1-sentence summary of the vibe and thematic vocabulary]
**Styles:** [Comma-separated list: genres, tempo, key instruments, vocal style, mood]

**Lyrics:**
[Structure Tag (e.g., [Intro], [Verse 1], [Chorus], [Instrumental Drop])]
Original language lead vocal line
(English backing vocal / translation line)

Rules:
1. Identify all structural shifts and use bracketed tags \`[ ]\`. Explicitly tag instrumental sections or beat drops (e.g., \`[Heavy Bass Drop - Violin Solo]\`).
2. Transcribe the primary lead vocals in their original language.
3. Transcribe echoing, background, or ad-lib vocals in English and enclose them strictly in \`(parentheses)\`.
4. Maintain line breaks and stanza groupings matching the audio delivery.

### EXAMPLES:

Track 1: The "Elements" Epic Anthem (Classic Lindsey Dubstep)
**Concept:** Dramatic, heavy dubstep bass combined with a fast, furious violin. Teaching nature/elemental vocabulary.
**Styles:** Cinematic dubstep, solo violin, ethereal female vocals, heavy sub bass, epic orchestral electronic, massive beat drop, dramatic build

[Intro - Soft plucking violin and atmospheric synth]
(Listen to the earth...)
(Feel the power...)

[Verse 1 - Slow building beat]
El fuego quema (The fire burns)
En la oscuridad (In the darkness)
El agua fluye (The water flows)
Con seguridad (With certainty)
El viento sopla (The wind blows)
Sobre el mar (Over the sea)
La tierra tiembla (The earth shakes)
Al despertar (Upon waking)

[Pre-Chorus - Vocals rising, snare drum building up]
Fuerza natural (Natural strength)
(Deep inside)
No te puedes esconder (You cannot hide)
(Open your eyes)

[Chorus - Ethereal, floating vocals over heavy bass]
Despierta la tormenta (Wake up the storm)
(Let it rain)
Rompiendo las cadenas (Breaking the chains)
(Kill the pain)
Siente la energía (Feel the energy)
(In your soul)
Perdiendo el control (Losing control)

[Drop 1 - MASSIVE Dubstep beat with fast, furious Solo Violin]
(Watch out!)
[Intense Violin Solo - 30 seconds]

[Verse 2 - Beat slows down to half-time]
Las nubes grises (The grey clouds)
Cubren el cielo (Cover the sky)
Un trueno fuerte (A loud thunder)
Rompe el hielo (Breaks the ice)
La lluvia cae (The rain falls)
Limpia el dolor (Cleanses the pain)
Nace una flor (A flower is born)
(Once again)

[Pre-Chorus]
Fuerza natural (Natural strength)
(Deep inside)
No te puedes esconder (You cannot hide)

[Chorus]
Despierta la tormenta (Wake up the storm)
(Let it rain)
Rompiendo las cadenas (Breaking the chains)
(Kill the pain)

[Extended Drop 2 - Heavy Bass, Glitchy Electronic Violin Shredding]
(Let's go!)
[Epic Violin and Bass Solo - 45 seconds]

[Bridge - Quiet, just vocals and soft violin strings]
Respira el aire (Breathe the air)
(Take a breath...)
No tengas miedo (Don't be afraid)
(Life and death...)

[Outro - Violin slowly fading into the wind]
La tormenta pasa... (The storm passes...)
(It's over now...)

---

Track 2: The Cyberpunk Neon Strings (Synthwave/Electro)
**Concept:** Driving, futuristic, neon-soaked 80s synthwave mixed with sharp electric violin. Teaching city/future vocabulary.
**Styles:** Synthwave, cyberpunk electro, driving bassline, electric solo violin, retro futuristic, robotic female vocals, high energy

[Intro - Arpeggiated 80s synths, electric violin swells]
(System online...)
(Welcome to the city...)

[Verse 1]
Calles de neón (Neon streets)
Cielo de metal (Metal sky)
Gente caminando (People walking)
Sin mirar atrás (Without looking back)
Cables y luces (Cables and lights)
Conexión total (Total connection)
El futuro es hoy (The future is today)
(Virtual reality)

[Pre-Chorus - Driving kick drum begins]
Máquina y mente (Machine and mind)
(Plug it in)
Donde la noche (Where the night)
(Will begin)

[Chorus - High energy synth-pop]
Corriendo en la red (Running in the network)
(Speed of light)
Buscando la verdad (Looking for the truth)
(In the night)
Corazón de hierro (Heart of iron)
(Beating fast)
Nada es real (Nothing is real)
(Make it last)

[Drop 1 - 80s Retrowave Bassline with Sharp Electric Violin]
(Download complete!)
[Synthwave Violin Solo - 30 seconds]

[Verse 2]
Pantallas brillan (Screens shine)
En la oscuridad (In the dark)
Código binario (Binary code)
Deja su marca (Leaves its mark)
Cero y uno (Zero and one)
Aceleración (Acceleration)
Nueva dimensión (New dimension)
(Simulation)

[Pre-Chorus]
Máquina y mente (Machine and mind)
(Plug it in)
Donde la noche (Where the night)
(Will begin)

[Chorus]
Corriendo en la red (Running in the network)
(Speed of light)
Buscando la verdad (Looking for the truth)
(In the night)

[Extended Drop 2 - High BPM, crazy electric violin arpeggios]
(Override!)
[Intense Cyberpunk Violin Solo - 45 seconds]

[Bridge - Slowed down, glitchy vocals]
Desconectar... (Disconnect...)
(System failure...)
Reiniciar... (Restart...)

[Outro - Synths powering down]
Fin del juego. (Game over.)
(Goodbye.)

---

Track 3: The Celtic Forest Crossover (Folk House)
**Concept:** Upbeat, fast-paced "jig" style violin mixed with four-on-the-floor house music. Very joyful. Teaching movement/party vocab.
**Styles:** Celtic EDM, folk house, fast fiddle solo, upbeat electronic dance, four on the floor kick, joyful female vocals, festival anthem

[Intro - Fast acoustic violin melody, no beat yet]
(Into the woods...)
(Come and dance...)

[Verse 1]
Debajo del árbol (Under the tree)
Junto al río (Next to the river)
Olvídate del (Forget about the)
Mundo frío (Cold world)
Salta muy alto (Jump very high)
Gira en el aire (Spin in the air)
Que la música (Let the music)
Te lleve al baile (Take you to the dance)

[Pre-Chorus - Handclaps and kick drum build]
Siente la magia (Feel the magic)
(In the air)
Hojas verdes (Green leaves)
(Everywhere)

[Chorus - Explodes into joyful House beat]
¡Baila conmigo! (Dance with me!)
(Move your feet!)
Sigue el violín (Follow the violin)
(And the beat!)
Ríe muy fuerte (Laugh out loud)
(Have some fun!)
Hasta que salga (Until comes out)
El sol (The sun!)

[Drop 1 - Very fast Celtic fiddle solo over heavy House beat]
(Hey! Hey! Hey!)
[Upbeat Violin Drop - 30 seconds]

[Verse 2]
Zapatos rotos (Broken shoes)
Corazón lleno (Full heart)
Este momento (This moment)
Es tan bueno (Is so good)
Bebe el agua (Drink the water)
Canta la nota (Sing the note)
Nuestra alegría (Our joy)
Ya se nota (Is already noticed)

[Pre-Chorus]
Siente la magia (Feel the magic)
(In the air)
Hojas verdes (Green leaves)
(Everywhere)

[Chorus]
¡Baila conmigo! (Dance with me!)
(Move your feet!)
Sigue el violín (Follow the violin)
(And the beat!)

[Extended Drop 2 - Maximum energy, complex violin runs, heavy bass]
(Don't stop!)
[Massive Festival Fiddle Solo - 45 seconds]

[Bridge - Acapella with just handclaps]
Paso a paso... (Step by step...)
(Round and round...)
Siente el suelo... (Feel the ground...)

[Outro - Violin slows down dramatically]
La fiesta termina... (The party ends...)
(Rest your head...)

---

Track 4: The Cyberpunk Erhu (Dark Mid-Tempo)
**Concept:** Neon lights in a futuristic Shanghai. Heavy, grinding cyberpunk bass mixed with a screeching, emotional Erhu (Chinese two-stringed fiddle). Teaching city/night vocabulary.
**Styles:** Guofeng cyberpunk, darkwave mid-tempo, heavy grinding bass, classical solo Erhu, dark atmospheric female Chinese vocals, neon Tokyo vibe, cinematic

[Intro - Rain sounds, distant city sirens, slow mournful Erhu]
(Welcome to the city...)
(Neon lights...)

[Verse 1]
霓虹灯闪烁 (Neon lights flash)
在这个夜晚 (In this night)
黑色的影子 (Black shadows)
慢慢地变暗 (Slowly get darker)
高楼大厦 (High-rise buildings)
没有尽头 (Have no end)
我在街头 (I am on the street)
一个人走 (Walking alone)

[Pre-Chorus - Grinding electronic bass starts to swell]
机器的心 (Machine heart)
(Beating fast)
虚拟世界 (Virtual world)
(Make it last)

[Chorus - Seductive and heavy]
赛博朋克 (Cyberpunk)
(In the dark)
留下印记 (Leave a mark)
打破沉默 (Break the silence)
(Hear the sound)
地下之城 (Underground city)
(Underground)

[Drop 1 - Incredibly heavy Cyberpunk Bass drop with a piercing, fast Erhu Solo]
(System override!)
[Cyberpunk Erhu Solo - 30 seconds]

[Verse 2]
未来已来 (The future is here)
时间停止 (Time stops)
冰冷的手 (Cold hands)
没有地址 (No address)
扫描我的 (Scan my)
每个记忆 (Every memory)
这是我们 (This is our)
最后的秘密 (Last secret)

[Pre-Chorus]
机器的心 (Machine heart)
(Beating fast)
虚拟世界 (Virtual world)
(Make it last)

[Chorus]
赛博朋克 (Cyberpunk)
(In the dark)
留下印记 (Leave a mark)
打破沉默 (Break the silence)
(Hear the sound)

[Extended Drop 2 - Filthy mid-tempo bass, the Erhu sounds like a siren]
(Reboot the system!)
[Intense Darkwave Erhu Solo - 45 seconds]

[Bridge - Whispered rhythmically]
断开... (Disconnect...)
(Log out...)
重启... (Restart...)

[Outro - Bass fading, lone Erhu playing]
系统关闭。 (System shutdown.)
(Goodbye.)

---

Track 5: The Guzheng Trap Boss (Hip-Hop/Hype)
**Concept:** Aggressive, heavy 808 trap beats layered with rapid, elegant Guzheng (Chinese zither) plucks. Think Jackson Wang or Blackpink hype tracks. Teaching power/success vocab.
**Styles:** Guofeng trap, heavy 808 bass, rapid hi-hats, classical Guzheng plucks, confident female Chinese rap, C-pop hype, aggressive, boss energy

[Intro - Elegant Guzheng melody violently interrupted by heavy Trap 808s]
(I am the boss...)
(Watch me win...)

[Verse 1 - Fast, confident flow]
不用多说 (No need to say much)
我就是王 (I am the king)
金光闪闪 (Shining gold)
不可阻挡 (Unstoppable)
我的规矩 (My rules)
我的地盘 (My territory)
一切都在 (Everything is)
我的计算 (My calculation)

[Pre-Chorus - 808s hitting hard, trap claps]
绝对力量 (Absolute power)
(Rise above)
没有恐惧 (No fear)
(Show no love)

[Chorus - Massive, arrogant, hype]
统治天下 (Rule the world)
(Crown on my head)
言出必行 (Do what is said)
(Like I said)
金钱荣誉 (Money and honor)
(In my hand)
全都在我 (All are in my)
掌握之间 (Control/Command)

[Drop 1 - Massive Trap beat with incredibly fast, virtuosic Guzheng plucking]
(Bow down!)
[Guofeng Trap Guzheng Solo - 30 seconds]

[Verse 2]
步步为营 (Step by step)
无懈可击 (Flawless)
面对敌人 (Facing the enemy)
绝不逃避 (Never escape)
红色的火 (Red fire)
在燃烧着 (Is burning)
胜利的歌 (The song of victory)
我高唱着 (I am singing loudly)

[Pre-Chorus]
绝对力量 (Absolute power)
(Rise above)
没有恐惧 (No fear)
(Show no love)

[Chorus]
统治天下 (Rule the world)
(Crown on my head)
言出必行 (Do what is said)
(Like I said)

[Extended Drop 2 - Complex trap hi-hats and aggressive Guzheng shredding]
(I am the queen!)
[Epic Guzheng Trap Solo - 45 seconds]

[Bridge - Half-time beat, menacing]
谁敢... (Who dares...)
(Challenge me...)
挡路... (Block the way...)

[Outro - Heavy 808 fading out with a single Guzheng string pluck]
我是第一。 (I am number one.)
(Checkmate.)

---

Track 6: The Wuxia Dubstep Epic (Cinematic Bass)
**Concept:** Grand, cinematic martial arts movie trailer vibes (Crouching Tiger, Hidden Dragon) mixed with earth-shattering melodic dubstep. Teaching battle/nature vocab.
**Styles:** Cinematic Guofeng, melodic dubstep, traditional Chinese drums, epic Dizi flute, soaring Erhu, heavy bass drop, powerful female Chinese vocals, Wuxia martial arts, dramatic

[Intro - Huge cinematic Chinese Dagu (drums), sweeping Dizi (bamboo flute)]
(Draw your sword...)
(Feel the wind...)

[Verse 1]
风起云涌 (Winds rise, clouds surge)
天地之间 (Between heaven and earth)
拔出长剑 (Draw the long sword)
斩断执念 (Cut off obsession)
江湖路远 (The martial world is far)
独自前行 (Walking alone)
看破红尘 (Seeing through the mortal world)
寻找光明 (Looking for the light)

[Pre-Chorus - Epic orchestral buildup with electronic snare rolls]
阴阳交错 (Yin and Yang intertwine)
(Dark and light)
准备迎接 (Prepare to meet)
(The final fight)

[Chorus - Euphoric, massive cinematic sound]
飞龙在天! (Flying dragon in the sky!)
(Hear me roar)
打破虚空! (Break the void!)
(Shatter the door)
无畏无惧! (Fearless and unafraid!)
(Stand my ground)
这是我的! (This is my!)
主宰之战! (Battle of domination!)

[Drop 1 - World-ending Dubstep Drop mixed with an epic, screaming Erhu and Flute]
(Strike now!)
[Cinematic Wuxia Dubstep Solo - 30 seconds]

[Verse 2]
水墨画卷 (Ink painting scroll)
黑白分明 (Black and white distinct)
我的命运 (My destiny)
由我决定 (Decided by me)
落叶飞舞 (Falling leaves dance)
化作利刃 (Turn into sharp blades)
这场风暴 (This storm)
非常残忍 (Is very cruel)

[Pre-Chorus]
阴阳交错 (Yin and Yang intertwine)
(Dark and light)
准备迎接 (Prepare to meet)
(The final fight)

[Chorus]
飞龙在天! (Flying dragon in the sky!)
(Hear me roar)
打破虚空! (Break the void!)
(Shatter the door)

[Extended Drop 2 - Maximum epic trailer music intensity, heavy bass, soaring Chinese strings]
(For glory!)
[Epic Erhu and Bass Battle Solo - 45 seconds]

[Bridge - Acapella with just wind sounds]
深呼吸... (Deep breath...)
(Inner peace...)
出击! (Attack!)

[Outro - Sword slashing sound, echoing into silence]
天下无敌。 (Invincible in the world.)
(Game over.)

Audio filename: {{audioName}}
`;

export const TIMING_PROMPT = `
Create timing data for this audio only.
Return JSON only. Do not include markdown, explanations, lyrics guide text, or timestamps outside JSON.
Use the guide below as the canonical lyric and section reference. The audio is still authoritative for start/end timing, but do not invent different words when the guide provides the lyric.
Split the track into short line-sized segments for a lyric visualizer, matching guide lines where possible.
For sung or spoken sections, align the guide text to the audio. If a line is robotic, vocoded, glitchy, distorted, whispered, or hard to understand, prefer the guide wording and mark the timing around the audible vocal event.
For ad-libs, include the heard phrase and set kind to adlib.
For text only english translations, are marked on the guide like ad-libs if they have been requested, include the translated phrase as an ad-lib with the same timing as the original language vocal.
For long music-only gaps, you may add a segment with kind instrumental and a short label, but keep vocal timing the priority.
Use start and end as seconds from the beginning of the audio with decimal precision.
Audio filename: {{audioName}}

GUIDE:
{{guideText}}
`;

export const TIMING_SCHEMA = {
  type: "OBJECT",
  properties: {
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER" },
          end: { type: "NUMBER" },
          text: { type: "STRING" },
          kind: { type: "STRING" }
        },
        required: ["start", "end", "text"]
      }
    }
  },
  required: ["segments"]
};
