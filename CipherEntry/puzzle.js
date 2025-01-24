/**************************************
 * puzzle.js
 **************************************/

/*
 * Mapping runic words to English solution:
 *   ᚨᛒᚾ         -> TWO
 *   ᛦᚡᚨᛊᚾᛦᚹ   -> NATIONS
 *   ᛒᛊᛎᛎ        -> WILL
 *   ᚴᚾ          -> GO
 *   ᚨᚾ          -> TO
 *   ᛒᚡᛢ        -> WAR
 *   ᚺᛏᚨ        -> BUT
 *   ᚾᛦᛎᚠ       -> ONLY
 *   ᚾᛦᛟ        -> ONE
 *   ᛒᛊᛎᛎ       -> WILL
 *   ᚱᛢᛟᛁᚡᛊᛎ   -> PREVAIL
 */

const runeWords = [
    "ᚨᛒᚾ",
    "ᛦᚡᚨᛊᚾᛦᚹ",
    "ᛒᛊᛎᛎ",
    "ᚴᚾ",
    "ᚨᚾ",
    "ᛒᚡᛢ",
    "ᚺᛏᚨ",
    "ᚾᛦᛎᚠ",
    "ᚾᛦᛟ",
    "ᛒᛊᛎᛎ",
    "ᚱᛢᛟᛁᚡᛊᛎ"
  ];
  
  const solutionWords = [
    "TWO",
    "NATIONS",
    "WILL",
    "GO",
    "TO",
    "WAR",
    "BUT",
    "ONLY",
    "ONE",
    "WILL",
    "PREVAIL"
  ];
  
  // Flattened array => "TWONATIONSWILLGOTOWARBUTONLYONEWILLPREVAIL"
  const solutionLetters = solutionWords.join("").split("");
  
  const answerContainer = document.getElementById("answer-container");
  const checkButton     = document.getElementById("checkButton");
  const resultPara      = document.getElementById("result");
  const copyButton      = document.getElementById("copyButton");
  const goButton        = document.getElementById("goButton");
  
  // Build each line: Runes + input boxes
  for (let i = 0; i < runeWords.length; i++) {
    const lineDiv = document.createElement("div");
    lineDiv.className = "puzzle-line";
  
    const runesSpan = document.createElement("span");
    runesSpan.className = "runes-for-word";
    runesSpan.textContent = runeWords[i];
    lineDiv.appendChild(runesSpan);
  
    const groupSpan = document.createElement("span");
    groupSpan.className = "answer-group";
  
    for (let j = 0; j < solutionWords[i].length; j++) {
      const letterBox = document.createElement("input");
      letterBox.type = "text";
      letterBox.maxLength = 1;
      letterBox.className = "answer-box";
      groupSpan.appendChild(letterBox);
    }
  
    lineDiv.appendChild(groupSpan);
    answerContainer.appendChild(lineDiv);
  }
  
  // Check answer logic
  checkButton.addEventListener("click", () => {
    const allInputs = document.querySelectorAll(".answer-box");
    let userLetters = "";
  
    allInputs.forEach(input => {
      userLetters += input.value;
    });
  
    // Normalize user input
    const normalizedUser = userLetters.replace(/\s+/g, "").toUpperCase();
    const normalizedSoln = solutionLetters.join("").toUpperCase();
  
    // Compare
    if (normalizedUser === normalizedSoln) {
      // Correct
      resultPara.textContent =
        "Correct! Go to https://www.survivorgeek.app/apps/36-piece-puzzle-correct to cast your vote.";
  
      // Make these buttons visible
      copyButton.classList.remove("hidden");
      goButton.classList.remove("hidden");
  
    } else {
      // Incorrect
      resultPara.textContent = "That answer isn't correct. Try again!";
    }
  });
  
  // Copy Link button
  copyButton.addEventListener("click", () => {
    const linkToCopy = "https://www.survivorgeek.app/apps/36-piece-puzzle-correct";
  
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(linkToCopy)
        .then(() => alert("Link copied: " + linkToCopy))
        .catch(err => console.error("Failed to copy: ", err));
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = linkToCopy;
      textArea.style.position = "absolute";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        alert("Link copied: " + linkToCopy);
      } catch (err) {
        console.error("Fallback copy: ", err);
      }
      document.body.removeChild(textArea);
    }
  });
  
  // Go to Link button
  goButton.addEventListener("click", () => {
    window.open("https://www.survivorgeek.app/apps/36-piece-puzzle-correct", "_blank");
  });
  