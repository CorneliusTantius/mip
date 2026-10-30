// Names for new chats, grouped by where they come from. Duplicates across groups are dropped below.
const GROUPS: Record<string, string[]> = {
  greekGods: [
    "Zeus", "Hera", "Poseidon", "Demeter", "Athena", "Apollo", "Artemis", "Ares", "Aphrodite", "Hephaestus", "Hermes", "Dionysus",
    "Hestia", "Hades", "Persephone", "Hecate", "Nike", "Nemesis", "Eos", "Helios", "Selene", "Gaia", "Uranus", "Cronus", "Rhea",
    "Oceanus", "Tethys", "Themis", "Mnemosyne", "Eris", "Hypnos", "Thanatos", "Nyx", "Erebus", "Chaos", "Pan", "Iris", "Hebe",
    "Eros", "Psyche", "Tyche", "Metis", "Leto", "Hyperion", "Prometheus", "Atlas", "Pontus", "Thalassa", "Nereus", "Triton",
    "Proteus", "Boreas", "Zephyrus", "Notus", "Eurus", "Aeolus", "Asclepius", "Hygieia", "Morpheus", "Phobos", "Deimos", "Harmonia",
    "Aether", "Hemera", "Ananke", "Phanes", "Momus", "Pallas", "Thetis", "Galatea", "Amphitrite", "Dione", "Ceto", "Phoebe", "Coeus",
    "Crius", "Iapetus", "Theia", "Astraea", "Dike", "Eirene", "Eunomia", "Pheme", "Hesperus", "Phosphorus", "Aura", "Nephele",
    "Plutus", "Lethe", "Styx", "Achlys", "Geras", "Hedone", "Peitho", "Eileithyia", "Aidos", "Tartarus", "Ophion", "Eurynome",
  ],
  muses: ["Calliope", "Clio", "Erato", "Euterpe", "Melpomene", "Polyhymnia", "Terpsichore", "Thalia", "Urania", "Aglaia", "Euphrosyne"],
  greekHeroes: [
    "Achilles", "Odysseus", "Hector", "Ajax", "Nestor", "Patroclus", "Telemachus", "Penelope", "Cassandra", "Andromache", "Priam",
    "Heracles", "Perseus", "Theseus", "Jason", "Medea", "Orpheus", "Atalanta", "Castor", "Pollux", "Meleager", "Peleus", "Telamon",
    "Bellerophon", "Ariadne", "Daedalus", "Icarus", "Antigone", "Electra", "Oedipus", "Creon", "Ismene", "Iphigenia", "Orestes",
    "Agamemnon", "Menelaus", "Helen", "Hippolyta", "Chiron", "Argus", "Narcissus", "Echo", "Ganymede", "Endymion", "Adonis",
    "Tiresias", "Sisyphus", "Tantalus", "Cadmus", "Europa", "Io", "Callisto", "Arachne", "Procne", "Philomela", "Penthesilea",
    "Laocoon", "Aeneas", "Dido", "Romulus", "Remus", "Evander",
  ],
  egyptianGods: [
    "Ra", "Osiris", "Isis", "Horus", "Set", "Thoth", "Ptah", "Amun", "Anubis", "Bastet", "Sekhmet", "Hathor", "Nut", "Geb", "Shu",
    "Tefnut", "Maat", "Khnum", "Sobek", "Apep", "Neith", "Nephthys", "Seshat", "Khepri", "Atum", "Aten", "Min", "Bes", "Taweret",
    "Wadjet", "Nekhbet", "Heqet", "Mut", "Khonsu", "Hapi", "Meretseger", "Serket", "Renenutet", "Sopdu", "Wepwawet", "Mehen", "Ammit",
    "Tenenet", "Hu", "Sia", "Heka", "Nun", "Naunet", "Amunet", "Kek", "Huh", "Hauhet", "Kauket", "Anuket", "Satet", "Shesmetet",
    "Bennu", "Sokar", "Ihy", "Imsety", "Duamutef", "Qebehsenuef", "Hedjet", "Iunit", "Mafdet", "Apedemak", "Dedun",
  ],
  mesopotamian: [
    "Marduk", "Ishtar", "Enlil", "Enki", "Anu", "Shamash", "Sin", "Nanna", "Utu", "Inanna", "Tiamat", "Apsu", "Nabu", "Ninurta",
    "Nergal", "Adad", "Ea", "Dumuzi", "Gilgamesh", "Enkidu", "Ninhursag", "Ereshkigal", "Ashur", "Kingu", "Ishkur", "Lahmu", "Namtar",
    "Ninlil", "Nisaba", "Ninsun", "Shala", "Kubaba", "Baal", "Anat", "Asherah", "Dagan", "Mot", "Yam", "Resheph", "Melqart",
    "Astarte", "Eshmun", "Kothar", "Attar",
  ],
  norse: [
    "Odin", "Thor", "Freya", "Frigg", "Loki", "Tyr", "Baldur", "Heimdall", "Njord", "Freyr", "Idun", "Bragi", "Vidar", "Vali", "Ullr",
    "Hel", "Sif", "Skadi", "Forseti", "Mimir", "Hodr", "Eir", "Saga", "Var", "Vor", "Lofn", "Snotra", "Sol", "Mani", "Gerd", "Gefjon",
    "Hermod", "Hoenir", "Lodur", "Aegir", "Ran", "Fenrir", "Jormungandr", "Sleipnir", "Huginn", "Muninn", "Skuld", "Urd", "Verdandi",
    "Eostre",
  ],
  roman: [
    "Jupiter", "Juno", "Neptune", "Ceres", "Minerva", "Diana", "Mars", "Venus", "Vulcan", "Mercury", "Bacchus", "Vesta", "Pluto",
    "Proserpina", "Janus", "Fortuna", "Victoria", "Aurora", "Luna", "Faunus", "Quirinus", "Terminus", "Flora", "Pomona", "Saturn",
    "Ops", "Concordia", "Libertas", "Somnus", "Lares", "Penates", "Lupercus", "Consus", "Cupid", "Hymen", "Quirina",
  ],
  vedic: [
    "Indra", "Agni", "Varuna", "Surya", "Vayu", "Soma", "Yama", "Ushas", "Rudra", "Vishnu", "Shiva", "Brahma", "Lakshmi", "Saraswati",
    "Ganesha", "Hanuman", "Kali", "Durga", "Parvati", "Kama", "Ratri", "Aditi", "Mitra", "Savitri", "Bhaga", "Pushan", "Vritra",
    "Tvashtar", "Ashvin", "Garuda", "Narada", "Vyasa", "Krishna", "Rama", "Sita", "Arjuna", "Bhima", "Karna", "Draupadi", "Prahlada",
    "Dhruva", "Ganga", "Yamuna", "Chandra", "Vasuki", "Shesha", "Kubera", "Chitragupta", "Nandi", "Bhairava",
  ],
  japanese: [
    "Amaterasu", "Susanoo", "Tsukuyomi", "Inari", "Raijin", "Fujin", "Hachiman", "Izanagi", "Izanami", "Benzaiten", "Ebisu",
    "Kagutsuchi", "Uzume", "Okuninushi", "Sarutahiko", "Omoikane", "Tenjin", "Daikokuten", "Bishamonten", "Kannon", "Jizo", "Ryujin",
    "Kojin", "Suijin", "Hotei", "Fukurokuju", "Jurojin", "Kishimojin",
  ],
  celtic: [
    "Dagda", "Brigid", "Lugh", "Morrigan", "Danu", "Nuada", "Ogma", "Manannan", "Epona", "Cernunnos", "Belenus", "Taranis", "Rhiannon",
    "Arawn", "Branwen", "Macha", "Aine", "Goibniu", "Dian Cecht", "Ceridwen", "Govannon", "Llew", "Modron",
  ],
  persian: [
    "Ahura Mazda", "Mithra", "Anahita", "Sraosha", "Verethragna", "Haoma", "Ashi", "Rashnu", "Tishtrya", "Zurvan", "Spenta Mainyu",
    "Vohu Manah", "Armaiti", "Ardvi Sura", "Atar",
  ],
  mesoamerican: [
    "Quetzalcoatl", "Tezcatlipoca", "Huitzilopochtli", "Tlaloc", "Xochiquetzal", "Mictlantecuhtli", "Coyolxauhqui",
    "Chalchiuhtlicue", "Itzamna", "Kukulkan", "Ixchel", "Hunahpu", "Xbalanque", "Ehecatl", "Xipe Totec", "Cihuacoatl",
  ],
  philosophers: [
    "Socrates", "Plato", "Aristotle", "Heraclitus", "Parmenides", "Zeno", "Thales", "Anaximander", "Anaximenes", "Pythagoras",
    "Empedocles", "Democritus", "Epicurus", "Lucretius", "Diogenes", "Antisthenes", "Crates", "Cleanthes", "Chrysippus", "Seneca",
    "Epictetus", "Marcus Aurelius", "Cicero", "Cato", "Plotinus", "Porphyry", "Proclus", "Hypatia", "Boethius", "Confucius", "Mencius",
    "Laozi", "Zhuangzi", "Mozi", "Xunzi", "Han Feizi", "Sun Tzu", "Gautama", "Nagarjuna", "Kapila", "Patanjali", "Shankara",
    "Anaxagoras", "Protagoras", "Gorgias", "Prodicus", "Isocrates", "Xenophon", "Eudoxus", "Theophrastus", "Strato", "Carneades",
    "Arcesilaus", "Pyrrho", "Sextus", "Philo", "Eudemus", "Dicaearchus", "Clearchus", "Polemon", "Panaetius", "Posidonius",
    "Hecato", "Musonius", "Dio", "Themistius", "Alcinous", "Atticus", "Numenius", "Celsus", "Origen", "Iamblichus", "Julian",
    "Ammonius", "Simplicius", "Damascius", "Macrobius", "Chalcidius", "Olympiodorus", "Xenophanes", "Melissus", "Ariston",
    "Hegesias", "Anaxarchus",
  ],
  sagesAndRulers: [
    "Imhotep", "Ptahhotep", "Akhenaten", "Nefertiti", "Hatshepsut", "Ramses", "Thutmose", "Khufu", "Djoser", "Sinuhe", "Hammurabi",
    "Sargon", "Ashurbanipal", "Zoroaster", "Cyrus", "Darius", "Xerxes", "Ashoka", "Chandragupta", "Chanakya", "Kautilya", "Sima Qian",
    "Ban Zhao", "Li Bai", "Du Fu", "Wang Wei", "Solon", "Bias", "Pittacus", "Cleobulus", "Chilon", "Periander", "Lycurgus", "Draco",
    "Cleisthenes", "Pericles", "Themistocles", "Leonidas", "Alcibiades", "Aspasia", "Pindar", "Sappho", "Simonides", "Alcaeus",
    "Anacreon", "Hesiod", "Homer", "Linus", "Musaeus", "Aesop", "Archilochus", "Tyrtaeus", "Stesichorus", "Ibycus", "Bacchylides",
    "Timotheus", "Phrynichus", "Agathon", "Antiphon", "Lysias", "Demosthenes", "Aeschines", "Herodotus", "Thucydides", "Xenophon",
    "Hippocrates", "Galen", "Plutarch", "Lucian", "Apuleius", "Ovid", "Virgil", "Horace", "Catullus", "Propertius", "Tibullus",
    "Juvenal", "Persius", "Martial", "Lucan", "Statius", "Terence", "Plautus", "Aristophanes", "Euripides", "Sophocles", "Aeschylus",
    "Menander", "Callimachus", "Apollonius", "Theocritus", "Bion", "Moschus", "Erinna", "Corinna", "Hipponax",
  ],
  scienceOfAntiquity: [
    "Euclid", "Archimedes", "Eratosthenes", "Hipparchus", "Aristarchus", "Ptolemy", "Hero", "Apollonius of Perga", "Diophantus",
    "Pappus", "Aristyllus", "Timocharis", "Meton", "Oenopides", "Hippias", "Hippasus", "Philolaus", "Archytas", "Theaetetus",
    "Menaechmus", "Conon", "Nicomedes", "Sosigenes", "Ctesibius", "Philo of Byzantium", "Heron",
  ],
  constellations: [
    "Orion", "Sirius", "Vega", "Altair", "Rigel", "Antares", "Pleione", "Hyades", "Pegasus", "Cassiopeia", "Andromeda", "Cepheus",
    "Draco", "Lyra", "Cygnus", "Aquila", "Centaurus", "Lupus", "Ara", "Crater", "Corvus", "Hydra", "Lepus", "Lynx", "Scorpius",
    "Sagittarius", "Capricornus", "Aquarius", "Pisces", "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Ursa Major",
    "Ursa Minor", "Auriga", "Boötes", "Hercules", "Ophiuchus", "Serpens", "Delphinus", "Equuleus", "Columba", "Phoenix", "Grus",
    "Pavo", "Indus", "Musca", "Norma", "Circinus", "Telescopium", "Vela", "Puppis", "Carina", "Triangulum", "Fornax", "Sculptor",
  ],
  virtuesAndConcepts: [
    "Logos", "Ethos", "Kairos", "Telos", "Arete", "Sophia", "Techne", "Phronesis", "Eudaimonia", "Aletheia", "Dialectic", "Praxis",
    "Theoria", "Mythos", "Eunoia", "Sophrosyne", "Andreia", "Dikaiosyne", "Ataraxia", "Apatheia", "Hedone", "Kosmos", "Chora",
    "Nous", "Pneuma", "Psyche", "Hypomnema", "Parrhesia", "Mimesis", "Physis", "Nomos", "Dharma", "Karma", "Tao", "Ren", "Li",
  ],
  placesOfAntiquity: [
    "Athens", "Sparta", "Corinth", "Thebes", "Delphi", "Olympia", "Ephesus", "Miletus", "Samos", "Syracuse", "Rhodes", "Knossos",
    "Mycenae", "Troy", "Ithaca", "Pergamon", "Alexandria", "Carthage", "Babylon", "Nineveh", "Ur", "Uruk", "Memphis", "Karnak", "Luxor", "Abydos", "Sais", "Byblos", "Tyre", "Sidon", "Palmyra", "Petra", "Ctesiphon", "Persepolis", "Susa", "Taxila",
    "Pataliputra", "Angkor", "Teotihuacan", "Tikal", "Cuzco", "Caral", "Carnac", "Stonehenge", "Newgrange", "Tara", "Aksum",
  ],
};

// Every name once, in the order the groups list them.
const AGENT_NAMES: string[] = [...new Set(Object.values(GROUPS).flat())];

// A random name that no other chat has. When every name is taken, a number is added to one of them.
export function pickAgentName(taken: Set<string>): string {
  const free = AGENT_NAMES.filter((name) => !taken.has(name));
  if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
  const base = AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)];
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name)) return name;
  }
}
