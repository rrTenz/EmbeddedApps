/**************************************
 * puzzle.js
 **************************************/

// We have 11 words in the puzzle, each mapped to its runes
const runeWords = [
    "ᚨᛒᚾ",          // => "TWO"
    "ᛦᚡᚨᛊᚾᛦᚹ",    // => "NATIONS"
    "ᛒᛊᛎᛎ",         // => "WILL"
    "ᚴᚾ",            // => "GO"
    "ᚨᚾ",            // => "TO"
    "ᛒᚡᛢ",          // => "WAR"
    "ᚺᛏᚨ",          // => "BUT"
    "ᚾᛦᛎᚠ",         // => "ONLY"
    "ᚾᛦᛟ",          // => "ONE"
    "ᛒᛊᛎᛎ",         // => "WILL"
    "ᚱᛢᛟᛁᚡᛊᛎ"      // => "PREVAIL"
  ];
  
  // The corresponding solution words
  const solutionWords = [
    "TWO",       // 3 letters
    "NATIONS",   // 7 letters
    "WILL",      // 4 letters
    "GO",        // 2 letters
    "TO",        // 2 letters
    "WAR",       // 3 letters
    "BUT",       // 3 letters
    "ONLY",      // 4 letters
    "ONE",       // 3 letters
    "WILL",      // 4 letters
    "PREVAIL"    // 7 letters
  ];
  
  // Flattened array of correct letters for final check
  // "TWO NATIONS WILL GO TO WAR BUT ONLY ONE WILL PREVAIL"
  const solutionLetters = solutionWords.join("").split("");
  
  // Gather DOM references
  const answerContainer = document.getElementById("answer-container");
  const checkButton     = document.getElementById("checkButton");
  const resultPara      = document.getElementById("result");
  const copyButton      = document.getElementById("copyButton");
  const goButton        = document.getElementById("goButton");
  
  // Build each line: runes + input boxes
  for (let i = 0; i < runeWords.length; i++) {
    const lineDiv = document.createElement("div");
    lineDiv.className = "puzzle-line";
  
    // Runes for this word
    const runesSpan = document.createElement("span");
    runesSpan.className = "runes-for-word";
    runesSpan.textContent = runeWords[i];
    lineDiv.appendChild(runesSpan);
  
    // Answer group container
    const groupSpan = document.createElement("span");
    groupSpan.className = "answer-group";
  
    // Create an input for each letter in the solution word
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
  
  // Handle "Check Answer" button
  checkButton.addEventListener("click", () => {
    const allInputs = document.querySelectorAll(".answer-box");
    let userLetters = "";
  
    allInputs.forEach(input => {
      userLetters += input.value;
    });
  
    // Normalize (remove spaces, uppercase)
    const normalizedUser = userLetters.replace(/\s+/g, "").toUpperCase();
    const normalizedSoln = solutionLetters.join("").toUpperCase();
  
    if (normalizedUser === normalizedSoln) {
      // Correct answer
      resultPara.textContent =
        "Correct! Go to https://www.survivorgeek.app/apps/36-piece-puzzle-correct to cast your vote.";
      // Show special buttons
      copyButton.classList.remove("hidden");
      goButton.classList.remove("hidden");
    } else {
      // Incorrect answer
      resultPara.textContent = "That answer isn't correct. Try again!";
    }
  });
  
  // "Copy Link" button
  copyButton.addEventListener("click", () => {
    const linkToCopy = "https://www.survivorgeek.app/apps/36-piece-puzzle-correct";
  
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(linkToCopy)
        .then(() => {
          alert("Link copied: " + linkToCopy);
        })
        .catch(err => {
          console.error("Failed to copy: ", err);
        });
    } else {
      // Fallback
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
        console.error("Fallback: Oops, unable to copy", err);
      }
      document.body.removeChild(textArea);
    }
  });
  
  // "Go to Link" button
  goButton.addEventListener("click", () => {
    window.open("https://www.survivorgeek.app/apps/36-piece-puzzle-correct", "_blank");
  });
  