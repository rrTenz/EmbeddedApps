const DATA_URL = "data/players.json";
const ALL_SURVIVOR_BOARD_SIZE = 24;
const MIN_SEASON_POOL_SIZE = 12;

let allPlayers = [];
let currentPool = [];
let mysteryPlayer = null;
let visibleIds = new Set();
let askedQuestionIds = new Set();
let clueHistory = [];
let questionCount = 0;
let wrongGuesses = 0;
let roundFinished = false;
let streak = Number(localStorage.getItem("survivorGuessWhoStreak") || 0);
let bestStreak = Number(localStorage.getItem("survivorGuessWhoBestStreak") || 0);
let questionOrder = new Map();
let pendingPoolValue = null;
let openQuestionGroup = null;
let boardAppearanceSeasonByPlayer = new Map();

const questionCountValue = document.getElementById("questionCountValue");
const wrongGuessValue = document.getElementById("wrongGuessValue");
const streakValue = document.getElementById("streakValue");
const remainingValue = document.getElementById("remainingValue");
const bestStreakValue = document.getElementById("bestStreakValue");
const poolSelect = document.getElementById("poolSelect");
const newGameBtn = document.getElementById("newGameBtn");
const howToPlayBtn = document.getElementById("howToPlayBtn");
const questionButtons = document.getElementById("questionButtons");
const playerBoard = document.getElementById("playerBoard");
const playerNames = document.getElementById("playerNames");
const guessInput = document.getElementById("guessInput");
const guessBtn = document.getElementById("guessBtn");
const clueLog = document.getElementById("clueLog");
const logCount = document.getElementById("logCount");
const gameHint = document.getElementById("gameHint");
const boardDescription = document.getElementById("boardDescription");
const boardPoolBadge = document.getElementById("boardPoolBadge");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBadge = document.getElementById("modalBadge");
const modalPlayer = document.getElementById("modalPlayer");
const modalText = document.getElementById("modalText");
const modalNextBtn = document.getElementById("modalNextBtn");
const helpModal = document.getElementById("helpModal");
const helpCloseBtn = document.getElementById("helpCloseBtn");
const confirmModal = document.getElementById("confirmModal");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmNewBtn = document.getElementById("confirmNewBtn");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function playerKey(player) {
  return player.id || normalize(player.name);
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function isKnown(value) {
  return value !== null && value !== undefined;
}

function selectedSeason() {
  return /^\d+$/.test(poolSelect.value) ? Number(poolSelect.value) : null;
}

function selectedEra() {
  const match = poolSelect.value.match(/^era-(\d+)-(\d+)$/);
  return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}

function isRandomMode() {
  return selectedSeason() === null;
}

function appearanceFor(player, season = selectedSeason()) {
  if (!season) return null;
  return (player.appearances || []).find(appearance => appearance.season === season) || null;
}

function loadedSeasonNumbers() {
  const counts = new Map();

  allPlayers.forEach(player => {
    (player.appearances || []).forEach(appearance => {
      const season = appearance.season;
      counts.set(season, (counts.get(season) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_SEASON_POOL_SIZE)
    .map(([season]) => season)
    .sort((a, b) => a - b);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function activePlayers() {
  return currentPool.filter(player => visibleIds.has(playerKey(player)));
}

function sharedLoadedSeasonsForActivePlayers() {
  const candidates = activePlayers();
  if (!candidates.length) return [];

  return loadedSeasonNumbers().filter(season =>
    candidates.every(player => playerPlayedSeason(player, season))
  );
}

function populatePoolSelect() {
  const priorValue = poolSelect.value || "all";
  const seasons = loadedSeasonNumbers();

  poolSelect.innerHTML = "";

  const randomGroup = document.createElement("optgroup");
  randomGroup.label = "Random 24";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = `All Survivor (Random ${Math.min(ALL_SURVIVOR_BOARD_SIZE, allPlayers.length)})`;
  randomGroup.appendChild(allOption);

  [
    [1, 10],
    [11, 20],
    [21, 30],
    [31, 40],
    [41, 50]
  ].forEach(([start, end]) => {
    const option = document.createElement("option");
    option.value = `era-${start}-${end}`;
    option.textContent = `Random 24: Seasons ${start}–${end}`;
    randomGroup.appendChild(option);
  });

  poolSelect.appendChild(randomGroup);

  const seasonGroup = document.createElement("optgroup");
  seasonGroup.label = "Specific Season";

  [...seasons].reverse().forEach(season => {
    const option = document.createElement("option");
    option.value = String(season);
    option.textContent = `Season ${season}`;
    seasonGroup.appendChild(option);
  });

  poolSelect.appendChild(seasonGroup);

  if ([...poolSelect.querySelectorAll("option")].some(option => option.value === priorValue)) {
    poolSelect.value = priorValue;
  }
}

function buildRoundPool() {
  const season = selectedSeason();
  const era = selectedEra();
  boardAppearanceSeasonByPlayer = new Map();

  if (season) {
    const pool = allPlayers
      .filter(player => appearanceFor(player, season))
      .sort((a, b) => a.name.localeCompare(b.name));

    pool.forEach(player => boardAppearanceSeasonByPlayer.set(playerKey(player), season));
    return pool;
  }

  let eligible = allPlayers;

  if (era) {
    eligible = allPlayers.filter(player =>
      (player.appearances || []).some(
        appearance => appearance.season >= era.start && appearance.season <= era.end
      )
    );
  }

  const selected = shuffle(eligible)
    .slice(0, Math.min(ALL_SURVIVOR_BOARD_SIZE, eligible.length));

  selected.forEach(player => {
    if (era) {
      const qualifying = (player.appearances || [])
        .filter(appearance => appearance.season >= era.start && appearance.season <= era.end);
      const chosen = qualifying[Math.floor(Math.random() * qualifying.length)];
      if (chosen) boardAppearanceSeasonByPlayer.set(playerKey(player), chosen.season);
    } else {
      const latest = (player.appearances || [])
        .filter(appearance => loadedSeasonNumbers().includes(appearance.season))
        .sort((a, b) => b.season - a.season)[0];
      if (latest) boardAppearanceSeasonByPlayer.set(playerKey(player), latest.season);
    }
  });

  return selected;
}

function chooseMysteryPlayer() {
  if (!currentPool.length) return null;
  return currentPool[Math.floor(Math.random() * currentPool.length)];
}

function initializeQuestionOrder() {
  questionOrder = new Map();
  buildQuestionCatalog().forEach(question => {
    questionOrder.set(question.id, Math.random());
  });
}

function seasonValue(player, season, field) {
  const appearance = appearanceFor(player, season);
  return appearance ? appearance[field] : null;
}

function playerPlayedSeason(player, season) {
  return (player.seasons || []).includes(season);
}

function firstSeason(player) {
  const seasons = player.seasons || [];
  return seasons.length ? Math.min(...seasons) : null;
}

function timesPlayed(player) {
  return (player.seasons || []).length;
}

function appearancesBeforeSeason(player, season) {
  return (player.appearances || []).filter(appearance => appearance.season < season);
}

function hadPlayedBeforeSeason(player, season) {
  return appearancesBeforeSeason(player, season).length > 0;
}

function previousSeasonCount(player, season) {
  return appearancesBeforeSeason(player, season).length;
}

function detailSeasonNumbersForRandomMode() {
  const era = selectedEra();
  const seasons = loadedSeasonNumbers();

  if (!era) return seasons;
  return seasons.filter(season => season >= era.start && season <= era.end);
}

function knownCareerAggregate(player, field) {
  const values = (player.appearances || [])
    .map(appearance => appearance[field])
    .filter(isKnown);

  if (!values.length) return null;
  return values.some(Boolean);
}

function addSeasonAppearanceQuestions(questions, season, categoryPrefix = "") {
  const category = categoryPrefix || `Season ${season}`;
  const add = (id, label, test) => questions.push({
    category,
    id: `${season}-${id}`,
    label,
    test
  });

  add("merge", `On Season ${season}, did they make the merge?`, player => {
    if (!playerPlayedSeason(player, season)) return false;
    return seasonValue(player, season, "madeMerge");
  });

  add("jury", `On Season ${season}, did they make the jury?`, player => {
    if (!playerPlayedSeason(player, season)) return false;
    return seasonValue(player, season, "juror");
  });

  add("final6", `On Season ${season}, did they reach the Final 6?`, player => {
    if (!playerPlayedSeason(player, season)) return false;
    const placement = seasonValue(player, season, "placement");
    return isKnown(placement) ? placement <= 6 : null;
  });

  add("final4", `On Season ${season}, did they reach the Final 4?`, player => {
    if (!playerPlayedSeason(player, season)) return false;
    const placement = seasonValue(player, season, "placement");
    return isKnown(placement) ? placement <= 4 : null;
  });

  add("finalist", `On Season ${season}, did they reach Final Tribal Council?`, player => {
    if (!playerPlayedSeason(player, season)) return false;
    return seasonValue(player, season, "finalist");
  });

  add("winner", `Did they win Season ${season}?`, player => {
    if (!playerPlayedSeason(player, season)) return false;
    return seasonValue(player, season, "winner");
  });

  const tribes = [...new Set(
    allPlayers
      .map(player => seasonValue(player, season, "originalTribe"))
      .filter(Boolean)
  )].sort();

  tribes.forEach(tribe => {
    add(
      `tribe-${normalize(tribe)}`,
      `On Season ${season}, did they start on ${tribe}?`,
      player => {
        if (!playerPlayedSeason(player, season)) return false;
        const playerTribe = seasonValue(player, season, "originalTribe");
        return playerTribe ? playerTribe === tribe : null;
      }
    );
  });
}

function buildQuestionCatalog() {
  const season = selectedSeason();
  const questions = [];
  const add = (category, id, label, test) => questions.push({ category, id, label, test });

  if (season) {
    add("This Season", "season-merge", "Did they make the merge?", player => seasonValue(player, season, "madeMerge"));
    add("This Season", "season-jury", "Did they make the jury?", player => seasonValue(player, season, "juror"));
    add("This Season", "season-final6", "Did they reach the Final 6?", player => {
      const placement = seasonValue(player, season, "placement");
      return isKnown(placement) ? placement <= 6 : null;
    });
    add("This Season", "season-final4", "Did they reach the Final 4?", player => {
      const placement = seasonValue(player, season, "placement");
      return isKnown(placement) ? placement <= 4 : null;
    });
    add("This Season", "season-finalist", "Did they reach Final Tribal Council?", player => seasonValue(player, season, "finalist"));
    add("This Season", "season-winner", "Did they win the season?", player => seasonValue(player, season, "winner"));

    // Only show age questions when the selected season actually has age coverage.
    const knownAges = currentPool.filter(player => isKnown(seasonValue(player, season, "age"))).length;
    if (knownAges >= Math.ceil(currentPool.length * 0.70)) {
      add("This Season", "age-30", "Were they 30 or older when the season began?", player => {
        const age = seasonValue(player, season, "age");
        return isKnown(age) ? age >= 30 : null;
      });
      add("This Season", "age-40", "Were they 40 or older when the season began?", player => {
        const age = seasonValue(player, season, "age");
        return isKnown(age) ? age >= 40 : null;
      });
    }

    const tribes = [...new Set(
      currentPool
        .map(player => seasonValue(player, season, "originalTribe"))
        .filter(Boolean)
    )].sort();

    tribes.forEach(tribe => {
      add(
        "Starting Tribe",
        `tribe-${normalize(tribe)}`,
        `Did they start on ${tribe}?`,
        player => {
          const playerTribe = seasonValue(player, season, "originalTribe");
          return playerTribe ? playerTribe === tribe : null;
        }
      );
    });

    add(
      "Career",
      "career-returnee",
      `Had they played Survivor before Season ${season}?`,
      player => hadPlayedBeforeSeason(player, season)
    );

    add(
      "Career",
      "career-two-prior",
      `Had they already played at least 2 previous seasons before Season ${season}?`,
      player => previousSeasonCount(player, season) >= 2
    );
  } else {
    const candidates = activePlayers();
    const fullyLoadedSeasons = loadedSeasonNumbers();
    const detailSeasons = detailSeasonNumbersForRandomMode();

    // Career questions remain useful even after the board narrows to players
    // from the same loaded season.
    add("Career", "career-returnee", "Have they played Survivor more than once?", player => timesPlayed(player) > 1);
    add("Career", "career-three-plus", "Have they played at least 3 seasons?", player => timesPlayed(player) >= 3);
    add("Career", "career-four-plus", "Have they played at least 4 seasons?", player => timesPlayed(player) >= 4);
    add("Career", "career-five-plus", "Have they played at least 5 seasons?", player => timesPlayed(player) >= 5);

    add("Career", "first-before-20", "Did they first play before Season 20?", player => {
      const value = firstSeason(player);
      return isKnown(value) ? value < 20 : null;
    });
    add("Career", "first-before-30", "Did they first play before Season 30?", player => {
      const value = firstSeason(player);
      return isKnown(value) ? value < 30 : null;
    });
    add("Career", "first-before-40", "Did they first play before Season 40?", player => {
      const value = firstSeason(player);
      return isKnown(value) ? value < 40 : null;
    });
    add("Career", "first-new-era", "Did they first play in the New Era (Season 41+)?", player => {
      const value = firstSeason(player);
      return isKnown(value) ? value >= 41 : null;
    });

    add("Career", "loaded-career-winner", "Have they won one of the seasons currently loaded?", player => knownCareerAggregate(player, "winner"));
    add("Career", "loaded-career-finalist", "Have they reached Final Tribal Council on a loaded season?", player => knownCareerAggregate(player, "finalist"));
    add("Career", "loaded-career-jury", "Have they made the jury on a loaded season?", player => knownCareerAggregate(player, "juror"));

    // Broad season-history questions can still be useful career clues.
    fullyLoadedSeasons.forEach(loadedSeason => {
      add(
        "Season History",
        `played-${loadedSeason}`,
        `Did they play on Season ${loadedSeason}?`,
        player => playerPlayedSeason(player, loadedSeason)
      );
    });

    // If every remaining suspect shares a fully loaded season, focus detailed
    // game questions on that shared season and suppress prior-season minutiae.
    const sharedLoadedSeasons = detailSeasons.filter(loadedSeason =>
      candidates.length > 0 &&
      candidates.every(player => playerPlayedSeason(player, loadedSeason))
    );

    if (sharedLoadedSeasons.length > 0) {
      sharedLoadedSeasons.forEach(sharedSeason => {
        addSeasonAppearanceQuestions(
          questions,
          sharedSeason,
          `Shared Season ${sharedSeason}`
        );
      });
    } else {
      // When the board still spans multiple seasons, detailed season questions
      // are allowed only for seasons represented by at least two active suspects.
      detailSeasons.forEach(loadedSeason => {
        const represented = candidates.filter(player => playerPlayedSeason(player, loadedSeason)).length;
        if (represented >= 2) {
          addSeasonAppearanceQuestions(
            questions,
            loadedSeason,
            `Season ${loadedSeason} Details`
          );
        }
      });
    }
  }

  return questions;
}

function evaluateQuestion(question, candidates) {
  let yes = 0;
  let no = 0;
  let unknown = 0;

  candidates.forEach(player => {
    const value = question.test(player);
    if (value === true) yes += 1;
    else if (value === false) no += 1;
    else unknown += 1;
  });

  const knownCount = yes + no;
  const useful = yes > 0 && no > 0;
  const balance = useful ? Math.min(yes, no) / Math.max(yes, no) : 0;

  return {
    ...question,
    yes,
    no,
    unknown,
    knownCount,
    useful,
    balance
  };
}

function availableQuestions() {
  const candidates = activePlayers();
  if (!mysteryPlayer || candidates.length <= 1) return [];

  return buildQuestionCatalog()
    .filter(question => !askedQuestionIds.has(question.id))
    .filter(question => isKnown(question.test(mysteryPlayer)))
    .map(question => evaluateQuestion(question, candidates))
    .filter(question => {
      const coverageThreshold = Math.max(2, Math.ceil(candidates.length * 0.70));
      return question.useful && question.knownCount >= coverageThreshold;
    })
    // Stable random order for the entire round. It does not reshuffle every
    // time the user asks a question, which would be disorienting.
    .sort((left, right) =>
      (questionOrder.get(left.id) ?? 0.5) - (questionOrder.get(right.id) ?? 0.5)
    );
}

function updateStats() {
  questionCountValue.textContent = questionCount;
  wrongGuessValue.textContent = wrongGuesses;
  streakValue.textContent = streak;
  bestStreakValue.textContent = bestStreak;
  remainingValue.textContent = activePlayers().length;
}

function updateGameHint() {
  const remaining = activePlayers().length;
  gameHint.classList.toggle("one-left", remaining === 1 && !roundFinished);

  if (roundFinished) {
    gameHint.textContent = "Round complete.";
  } else if (remaining === 1) {
    gameHint.textContent = "Only one suspect remains. Click the portrait to make your final guess!";
  } else if (remaining > 1) {
    const sharedSeasons = selectedSeason() ? [] : sharedLoadedSeasonsForActivePlayers();
    if (sharedSeasons.length === 1) {
      gameHint.textContent = `${remaining} suspects remain. All remaining players share Season ${sharedSeasons[0]}.`;
    } else {
      gameHint.textContent = `${remaining} suspects remain. Ask a question or click an active portrait to guess.`;
    }
  } else {
    gameHint.textContent = "No suspects remain. Start a new game.";
  }
}

function updateBoardLabels() {
  const season = selectedSeason();
  const era = selectedEra();

  if (season) {
    boardDescription.textContent = `Full Season ${season} cast. Click an active portrait when you are ready to guess.`;
    boardPoolBadge.textContent = `${currentPool.length} players`;
  } else {
    const sharedSeasons = sharedLoadedSeasonsForActivePlayers();

    if (sharedSeasons.length === 1 && activePlayers().length < currentPool.length) {
      boardDescription.textContent =
        `The remaining suspects all share Season ${sharedSeasons[0]}; detailed questions now focus on that season.`;
    } else if (era) {
      boardDescription.textContent =
        `A random board drawn from contestants who played in Seasons ${era.start}–${era.end}.`;
    } else {
      boardDescription.textContent =
        "A fresh random board drawn from every U.S. Survivor contestant.";
    }

    boardPoolBadge.textContent = era
      ? `S${era.start}–S${era.end}`
      : `Random ${currentPool.length}`;
  }
}

function addLogEntry(type, label, answer, eliminated = null, remaining = null) {
  clueHistory.unshift({ type, label, answer, eliminated, remaining });
  renderClueLog();
}

function renderClueLog() {
  logCount.textContent = clueHistory.length;

  if (!clueHistory.length) {
    clueLog.innerHTML = '<p class="muted">Your questions and guesses will appear here.</p>';
    return;
  }

  clueLog.innerHTML = "";

  clueHistory.forEach(entry => {
    const row = document.createElement("div");
    row.className = `clue-entry ${entry.type === "guess" ? "guess-entry" : ""}`;

    const copy = document.createElement("div");
    copy.className = "clue-copy";

    const kicker = document.createElement("span");
    kicker.className = "clue-kicker";
    kicker.textContent = entry.type === "guess" ? "Guess" : "Question";

    const text = document.createElement("span");
    text.textContent = entry.label;

    copy.append(kicker, text);

    if (isKnown(entry.eliminated) && isKnown(entry.remaining)) {
      const impact = document.createElement("span");
      impact.className = "clue-impact";
      const noun = entry.eliminated === 1 ? "card" : "cards";
      impact.innerHTML = `<strong>${entry.eliminated}</strong> ${noun} removed • <strong>${entry.remaining}</strong> remaining`;
      copy.appendChild(impact);
    }

    const result = document.createElement("span");
    result.className = `clue-answer ${entry.answer ? "yes" : "no"}`;
    result.textContent = entry.answer ? "YES" : "NO";

    row.append(copy, result);
    clueLog.appendChild(row);
  });
}

function askQuestion(question) {
  if (!mysteryPlayer || roundFinished || askedQuestionIds.has(question.id)) return;

  const answer = question.test(mysteryPlayer);
  if (!isKnown(answer)) {
    console.warn("Question skipped because mystery player's metadata is unknown:", question.id);
    return;
  }

  const previousVisibleIds = new Set(visibleIds);

  const matchingIds = new Set(
    currentPool
      .filter(player => {
        const value = question.test(player);
        return !isKnown(value) || Boolean(value) === Boolean(answer);
      })
      .map(playerKey)
  );

  const nextVisibleIds = new Set(
    [...visibleIds].filter(id => matchingIds.has(id))
  );

  const mysteryId = playerKey(mysteryPlayer);

  if (!nextVisibleIds.has(mysteryId) || nextVisibleIds.size === 0) {
    console.error("Deduction invariant failed. Question was not applied.", {
      question: question.id,
      answer,
      mysteryPlayer: mysteryPlayer.name
    });
    visibleIds = previousVisibleIds;
    return;
  }

  const eliminatedCount = previousVisibleIds.size - nextVisibleIds.size;

  visibleIds = nextVisibleIds;
  askedQuestionIds.add(question.id);
  questionCount += 1;
  addLogEntry("question", question.label, Boolean(answer), eliminatedCount, nextVisibleIds.size);

  renderQuestions();
  renderBoard();
  renderDatalist();
  updateStats();
  updateGameHint();
  updateBoardLabels();
}

function preferredQuestionGroup(categories) {
  const season = selectedSeason();

  if (season && categories.includes("This Season")) return "This Season";
  if (!season && categories.includes("Career")) return "Career";
  return categories[0] || null;
}

function categorySortValue(category) {
  if (selectedSeason()) {
    if (category === "This Season") return 0;
    if (category === "Starting Tribe") return 1;
    if (category === "Career") return 2;
    return 10;
  }

  if (category === "Career") return 0;
  if (category === "Season History") return 1;
  if (category.startsWith("Shared Season")) return 2;

  const match = category.match(/Season (\\d+) Details/);
  if (match) return 100 + Number(match[1]);

  return 1000;
}

function renderQuestions() {
  questionButtons.innerHTML = "";

  const questions = availableQuestions();

  if (!questions.length) {
    const wrapper = document.createElement("div");
    wrapper.className = "empty-questions";

    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = activePlayers().length <= 1
      ? "You've narrowed it down. Make your guess!"
      : "No more useful metadata questions are available for these remaining suspects. Make your best guess.";

    wrapper.appendChild(message);
    questionButtons.appendChild(wrapper);
    return;
  }

  const groups = new Map();

  questions.forEach(question => {
    if (!groups.has(question.category)) groups.set(question.category, []);
    groups.get(question.category).push(question);
  });

  const categories = [...groups.keys()].sort((a, b) => {
    const valueDiff = categorySortValue(a) - categorySortValue(b);
    return valueDiff || a.localeCompare(b);
  });

  if (!categories.includes(openQuestionGroup)) {
    openQuestionGroup = preferredQuestionGroup(categories);
  }

  categories.forEach(category => {
    const items = groups.get(category);
    const details = document.createElement("details");
    details.className = "question-group";
    details.dataset.category = category;
    details.open = category === openQuestionGroup;

    const summary = document.createElement("summary");
    summary.textContent = category;

    const body = document.createElement("div");
    body.className = "question-group-body";

    items.forEach(question => {
      const button = document.createElement("button");
      button.className = "question-button";
      button.textContent = question.label;

      button.addEventListener("click", () => askQuestion(question));
      body.appendChild(button);
    });

    details.addEventListener("toggle", () => {
      if (details.open) {
        openQuestionGroup = category;
        questionButtons.querySelectorAll("details.question-group").forEach(other => {
          if (other !== details) other.open = false;
        });
      } else if (openQuestionGroup === category) {
        openQuestionGroup = null;
      }
    });

    details.append(summary, body);
    questionButtons.appendChild(details);
  });
}

function currentCardSeason(player) {
  const season = selectedSeason();
  if (season) return season;

  const boardSeason = boardAppearanceSeasonByPlayer.get(playerKey(player));
  if (boardSeason) return boardSeason;

  const loadedAppearances = (player.appearances || [])
    .map(appearance => appearance.season)
    .filter(seasonNumber => loadedSeasonNumbers().includes(seasonNumber));

  if (loadedAppearances.length) return Math.max(...loadedAppearances);

  const seasons = player.seasons || [];
  return seasons.length ? Math.max(...seasons) : "?";
}

function imageFor(player) {
  const season = selectedSeason();
  if (season) {
    const appearance = appearanceFor(player, season);
    if (appearance?.image) return appearance.image;
  }

  const boardSeason = boardAppearanceSeasonByPlayer.get(playerKey(player));
  if (boardSeason) {
    const appearance = appearanceFor(player, boardSeason);
    if (appearance?.image) return appearance.image;
  }

  const loadedAppearances = (player.appearances || [])
    .filter(appearance => appearance.image)
    .sort((a, b) => b.season - a.season);

  return loadedAppearances[0]?.image || player.image || null;
}

function renderPlayerImage(player, container, className = "player-image") {
  const source = imageFor(player);

  if (!source) {
    const placeholder = document.createElement("div");
    placeholder.className = "player-placeholder";
    placeholder.textContent = initials(player.name);
    container.appendChild(placeholder);
    return;
  }

  const image = document.createElement("img");
  image.className = className;
  image.src = source;
  image.alt = player.name;
  image.loading = "lazy";

  image.addEventListener("error", () => {
    image.remove();
    const placeholder = document.createElement("div");
    placeholder.className = "player-placeholder";
    placeholder.textContent = initials(player.name);
    container.appendChild(placeholder);
  }, { once: true });

  container.appendChild(image);
}

function renderBoard() {
  playerBoard.innerHTML = "";

  currentPool.forEach(player => {
    const key = playerKey(player);
    const active = visibleIds.has(key);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "player-card";
    card.setAttribute("aria-label", active ? `Guess ${player.name}` : `${player.name}, eliminated`);

    if (!active) {
      card.classList.add("eliminated");
      card.disabled = true;
    }

    const imageWrap = document.createElement("div");
    imageWrap.className = "player-image-wrap";
    renderPlayerImage(player, imageWrap);

    const chip = document.createElement("span");
    chip.className = "season-chip";
    chip.textContent = `S${currentCardSeason(player)}`;
    imageWrap.appendChild(chip);

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name;

    card.append(imageWrap, name);

    if (active) {
      card.addEventListener("click", () => makePlayerGuess(player));
    }

    playerBoard.appendChild(card);
  });
}

function renderDatalist() {
  playerNames.innerHTML = "";

  activePlayers()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(player => {
      const option = document.createElement("option");
      option.value = player.name;
      playerNames.appendChild(option);
    });
}


function resultSeasonContext(player) {
  const season = selectedSeason();
  if (season) return `Season ${season}`;

  const boardSeason = boardAppearanceSeasonByPlayer.get(playerKey(player));
  if (boardSeason) return `Season ${boardSeason}`;

  const appearances = (player.appearances || [])
    .map(appearance => appearance.season)
    .sort((a, b) => a - b);

  if (!appearances.length) return "";

  if (appearances.length === 1) return `Season ${appearances[0]}`;
  return `Seasons ${appearances.join(", ")}`;
}

function revealWin() {
  roundFinished = true;
  modal.classList.remove("hidden");
  modalPlayer.innerHTML = "";

  const imageWrap = document.createElement("div");
  imageWrap.className = "player-image-wrap";
  renderPlayerImage(mysteryPlayer, imageWrap);
  modalPlayer.appendChild(imageWrap);

  const era = selectedEra();
  const modeKey = selectedSeason()
    ? `season-${selectedSeason()}`
    : era
      ? `era-${era.start}-${era.end}`
      : "all";
  const bestQuestionsKey = `survivorGuessWhoBestQuestions:${modeKey}`;
  const priorBestQuestions = Number(localStorage.getItem(bestQuestionsKey) || 0);
  const isQuestionBest = priorBestQuestions === 0 || questionCount < priorBestQuestions;

  if (isQuestionBest) {
    localStorage.setItem(bestQuestionsKey, String(questionCount));
  }

  modalBadge.textContent = "🔥";
  modalTitle.textContent = "You got it!";

  const bestQuestionEntry = clueHistory
    .filter(entry => entry.type === "question" && isKnown(entry.eliminated))
    .sort((a, b) => b.eliminated - a.eliminated)[0];

  const seasonContext = resultSeasonContext(mysteryPlayer);

  modalText.innerHTML = `
    <strong>${mysteryPlayer.name}</strong> was the mystery Survivor.
    ${seasonContext ? `<div class="result-season">${seasonContext}</div>` : ""}
    <div class="result-stats">
      <div class="result-stat"><strong>${questionCount}</strong><span>Questions</span></div>
      <div class="result-stat"><strong>${wrongGuesses}</strong><span>Wrong</span></div>
      <div class="result-stat"><strong>${streak}</strong><span>Streak</span></div>
    </div>
    ${bestQuestionEntry ? `<div class="muted small">Best question removed ${bestQuestionEntry.eliminated} cards.</div>` : ""}
    ${isQuestionBest ? `<div class="personal-best">★ New fewest-questions best for this mode!</div>` : ""}
  `;

  renderBoard();
  renderQuestions();
  updateGameHint();
}

function makePlayerGuess(player) {
  if (!mysteryPlayer || roundFinished || !visibleIds.has(playerKey(player))) return;

  const correct = playerKey(player) === playerKey(mysteryPlayer);

  if (correct) {
    addLogEntry("guess", `Is it ${player.name}?`, true, 0, activePlayers().length);
    streak += 1;
    localStorage.setItem("survivorGuessWhoStreak", String(streak));
    if (streak > bestStreak) {
      bestStreak = streak;
      localStorage.setItem("survivorGuessWhoBestStreak", String(bestStreak));
    }
    updateStats();
    revealWin();
    return;
  }

  wrongGuesses += 1;
  visibleIds.delete(playerKey(player));
  addLogEntry("guess", `Is it ${player.name}?`, false, 1, activePlayers().length);

  if (!visibleIds.has(playerKey(mysteryPlayer))) {
    console.error("Guess invariant failed: mystery player was removed unexpectedly.");
    visibleIds.add(playerKey(mysteryPlayer));
  }

  guessInput.value = "";
  renderBoard();
  renderDatalist();
  renderQuestions();
  updateStats();
  updateGameHint();
  updateBoardLabels();
}

function makeTypedGuess() {
  if (!mysteryPlayer || roundFinished) return;

  const typed = normalize(guessInput.value);
  const guessedPlayer = activePlayers().find(player => normalize(player.name) === typed);

  if (!guessedPlayer) {
    guessInput.focus();
    return;
  }

  makePlayerGuess(guessedPlayer);
}

function startGame() {
  currentPool = buildRoundPool();
  mysteryPlayer = chooseMysteryPlayer();
  visibleIds = new Set(currentPool.map(playerKey));
  askedQuestionIds = new Set();
  clueHistory = [];
  questionCount = 0;
  wrongGuesses = 0;
  roundFinished = false;
  openQuestionGroup = selectedSeason() ? "This Season" : "Career";
  guessInput.value = "";
  modal.classList.add("hidden");
  confirmModal.classList.add("hidden");

  initializeQuestionOrder();
  renderClueLog();
  renderQuestions();
  renderBoard();
  renderDatalist();
  updateStats();
  updateGameHint();
  updateBoardLabels();
}

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${DATA_URL}`);

    const payload = await response.json();
    allPlayers = Array.isArray(payload) ? payload : payload.players;

    if (!Array.isArray(allPlayers) || !allPlayers.length) {
      throw new Error("No players found in metadata.");
    }

    populatePoolSelect();
    streakValue.textContent = streak;
    bestStreakValue.textContent = bestStreak;
    startGame();
  } catch (error) {
    console.error(error);
    playerBoard.innerHTML = `
      <div class="glass panel">
        <h2>Could not load player data</h2>
        <p class="muted">
          Run from the EmbeddedApps folder with
          <code>python3 -m http.server 8000</code>.
        </p>
      </div>
    `;
  }
}

function gameHasProgress() {
  return !roundFinished && (questionCount > 0 || wrongGuesses > 0);
}

function requestNewGame() {
  if (gameHasProgress()) {
    pendingPoolValue = null;
    confirmModal.classList.remove("hidden");
  } else {
    startGame();
  }
}

function requestPoolChange(previousValue) {
  if (gameHasProgress()) {
    pendingPoolValue = poolSelect.value;
    poolSelect.value = previousValue;
    confirmModal.classList.remove("hidden");
  } else {
    startGame();
  }
}

let lastPoolValue = poolSelect.value;

newGameBtn.addEventListener("click", requestNewGame);

poolSelect.addEventListener("focus", () => {
  lastPoolValue = poolSelect.value;
});

poolSelect.addEventListener("change", () => {
  const requestedValue = poolSelect.value;
  if (gameHasProgress()) {
    pendingPoolValue = requestedValue;
    poolSelect.value = lastPoolValue;
    confirmModal.classList.remove("hidden");
  } else {
    lastPoolValue = requestedValue;
    startGame();
  }
});

confirmCancelBtn.addEventListener("click", () => {
  pendingPoolValue = null;
  confirmModal.classList.add("hidden");
});

confirmNewBtn.addEventListener("click", () => {
  if (pendingPoolValue !== null) {
    poolSelect.value = pendingPoolValue;
    lastPoolValue = pendingPoolValue;
    pendingPoolValue = null;
  }
  confirmModal.classList.add("hidden");
  startGame();
});

howToPlayBtn.addEventListener("click", () => helpModal.classList.remove("hidden"));
helpCloseBtn.addEventListener("click", () => helpModal.classList.add("hidden"));

helpModal.addEventListener("click", event => {
  if (event.target === helpModal) helpModal.classList.add("hidden");
});

confirmModal.addEventListener("click", event => {
  if (event.target === confirmModal) {
    pendingPoolValue = null;
    confirmModal.classList.add("hidden");
  }
});

guessBtn.addEventListener("click", makeTypedGuess);
guessInput.addEventListener("keydown", event => {
  if (event.key === "Enter") makeTypedGuess();
});
modalNextBtn.addEventListener("click", startGame);

init();
