// Names for new agents: Norse gods and beings, heroes of the sagas, and rulers of the Viking Age.
// Plain ASCII spellings. Duplicates across groups are dropped below.
const GROUPS: Record<string, string[]> = {
  aesirAndVanir: [
    "Odin", "Thor", "Tyr", "Baldur", "Heimdall", "Bragi", "Vidar", "Vali", "Ull", "Hodur", "Loki", "Forseti", "Hermod", "Hoenir",
    "Lodur", "Mimir", "Njord", "Freyr", "Skirnir", "Kvasir", "Buri", "Bor", "Vili", "Ve",
  ],
  goddesses: [
    "Frigg", "Freyja", "Idun", "Sif", "Skadi", "Eir", "Saga", "Var", "Vor", "Lofn", "Snotra", "Gerd", "Gefjon", "Nanna", "Sjofn",
    "Syn", "Hlin", "Fulla", "Gna", "Ran", "Rindr", "Sigyn", "Hel",
  ],
  cosmos: ["Sol", "Mani", "Dagr", "Nott", "Jord", "Ymir", "Ginnungagap", "Yggdrasil", "Hvergelmir"],
  giantsAndBeasts: [
    "Fenrir", "Jormungandr", "Sleipnir", "Huginn", "Muninn", "Geri", "Freki", "Garm", "Nidhogg", "Ratatoskr", "Surtr", "Angrboda",
    "Thrym", "Hymir", "Aegir", "Hrungnir", "Skrymir", "Thiazi", "Gymir", "Suttung", "Gunnlod", "Hrym", "Bergelmir", "Vafthrudnir",
    "Hati", "Skoll", "Fafnir", "Regin",
  ],
  valkyriesAndFates: [
    "Brynhild", "Sigrun", "Gunnr", "Skogul", "Hildr", "Mist", "Svipul", "Gondul", "Hlokk", "Geirskogul", "Randgrid", "Reginleif",
    "Olrun", "Thrud", "Sanngrid", "Urd", "Verdandi", "Skuld",
  ],
  dwarves: [
    "Modsognir", "Durin", "Dvalin", "Nyi", "Nidi", "Dain", "Bifur", "Bombur", "Bofur", "Thorin", "Oin", "Gloin", "Dori", "Nori", "Ori",
    "Balin", "Dwalin", "Fili", "Kili", "Andvari", "Brokk", "Eitri", "Sindri", "Alfrik", "Vindalf", "Berling", "Thror", "Thrain",
    "Lit", "Ivaldi", "Alvis",
  ],
  heroes: [
    "Sigurd", "Gunnar", "Hogni", "Gudrun", "Atli", "Helgi", "Sigmund", "Signy", "Volsung", "Sinfjotli", "Hamund", "Hjordis", "Ragnar",
    "Starkad", "Hrolf", "Kraki", "Bjarki", "Hjalmar", "Ingeld", "Hervor", "Angantyr", "Hadding", "Frodi", "Hrani",
  ],
  sagaFigures: [
    "Egil", "Grettir", "Njal", "Gisli", "Hallgerd", "Kari", "Skarphedin", "Gunnlaug", "Hrafnkel", "Thorolf", "Thorgeir", "Gudrid",
    "Freydis", "Snorri", "Unn", "Kjartan", "Bolli", "Gunnhild", "Thorkel", "Vigdis", "Halldor", "Hallfred", "Hjalti", "Gellir",
    "Skallagrim", "Thord", "Thorstein", "Thorvald", "Thorfinn", "Leif", "Sigrid", "Eyjolf", "Glum", "Hrut", "Hildigunn", "Ketil",
    "Ulf", "Hrapp", "Thorbjorn", "Ingolf", "Hjorleif", "Thorgils", "Gudmund", "Hallbjorn", "Thorgerd",
  ],
  vikingAge: [
    "Ivar", "Ubba", "Halfdan", "Bjorn", "Harald", "Haakon", "Olaf", "Knut", "Sweyn", "Gorm", "Rollo", "Hastein", "Guthrum", "Ormr",
    "Hrorik", "Alfgifu", "Thyra", "Aslaug", "Ragnhild", "Erik", "Svein", "Sigtrygg", "Olof", "Ingvar", "Ottar",
  ],
  realms: [
    "Asgard", "Midgard", "Valhalla", "Bifrost", "Jotunheim", "Niflheim", "Muspelheim", "Alfheim", "Vanaheim", "Svartalfheim",
    "Utgard", "Hlidskjalf", "Gladsheim", "Folkvang", "Himinbjorg",
  ],
};

// Every name once, in the order the groups list them.
const AGENT_NAMES: string[] = [...new Set(Object.values(GROUPS).flat())];

// A random name that no other agent has. When every name is taken, a number is added to one of them.
export function pickAgentName(taken: Set<string>): string {
  const free = AGENT_NAMES.filter((name) => !taken.has(name));
  if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
  const base = AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)];
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name)) return name;
  }
}
