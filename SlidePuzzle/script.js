// script.js

let size = 3; // Default puzzle size matching the default value in index.html
let timerInterval;
let timeElapsed = 0;
let moveCount = 0; // Initialize move counter
let emptyX, emptyY;
let tiles = [];
let image;
let season;
let imagesData = {}; // To store the parsed images.json data
let leaderboardKey = `leaderboard_${size}x${size}`; // Initialize leaderboard key with default size

// Function to format the image filenames
function formatImageName(filename) {
    // Remove the file extension
    let name = filename.substring(0, filename.lastIndexOf('.')) || filename;

    // Replace underscores and hyphens with spaces
    name = name.replace(/[-_]/g, ' ');

    // Capitalize each word
    name = name.replace(/\b\w/g, char => char.toUpperCase());

    return name;
}

// Function to fetch and load images data from images.json
function loadImagesData() {
    fetch('images.json')
        .then(response => response.json())
        .then(data => {
            imagesData = data;
            populateSeasonSelect();
        })
        .catch(error => {
            console.error('Error loading images data:', error);
        });
}

// Function to populate the season select dropdown
function populateSeasonSelect() {
    const seasonSelect = document.getElementById('season-select');
    seasonSelect.innerHTML = ''; // Clear existing options

    const seasons = Object.keys(imagesData).sort(); // Get and sort the seasons

    seasons.forEach(seasonValue => {
        const option = document.createElement('option');
        option.value = seasonValue;
        option.text = `Season ${seasonValue}`;
        seasonSelect.appendChild(option);
    });

    // Set default selected season
    season = seasonSelect.value;

    // Populate image select dropdown based on the selected season
    populateImageSelect();

    // Add event listener for season change
    seasonSelect.addEventListener('change', onSeasonChange);
}

// Function to handle season change
function onSeasonChange() {
    season = document.getElementById('season-select').value;
    populateImageSelect();
}

// Function to populate the image select dropdown based on selected season
function populateImageSelect() {
    const imageSelect = document.getElementById('image-select');
    imageSelect.innerHTML = ''; // Clear existing options

    const images = imagesData[season];

    images.forEach(filename => {
        const option = document.createElement('option');
        option.value = filename;
        option.text = formatImageName(filename);
        imageSelect.appendChild(option);
    });
}

// Call the function to load images data when the page loads
loadImagesData();

// Event listeners for start button and size input change
document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('size').addEventListener('change', onSizeChange);

// Function to handle changes in puzzle size input
function onSizeChange() {
    size = parseInt(document.getElementById('size').value);
    console.log(`Size changed to: ${size}`);
    if (isNaN(size) || size < 3 || size > 10) {
        alert('Please enter a valid puzzle size between 3 and 10.');
        size = 3; // Set default size
        document.getElementById('size').value = size; // Reset input field
    }
    leaderboardKey = `leaderboard_${size}x${size}`;
    loadLeaderboard();
}

// Function to start the game
function startGame() {
    size = parseInt(document.getElementById('size').value);
    console.log(`Starting game with size: ${size}`);
    if (isNaN(size) || size < 3 || size > 10) {
        alert('Please enter a valid puzzle size between 3 and 10.');
        size = 3; // Set default size
        document.getElementById('size').value = size; // Reset input field
    }
    leaderboardKey = `leaderboard_${size}x${size}`;
    const imageSelect = document.getElementById('image-select');
    image = imageSelect.value;
    season = document.getElementById('season-select').value;
    initGame();
}

// Function to initialize the game
function initGame() {
    console.log(`Initializing game with size: ${size}`);
    clearInterval(timerInterval);
    timeElapsed = 0;
    moveCount = 0; // Reset move counter
    document.getElementById('timer').innerText = 'Time: 0';
    document.getElementById('move-counter').innerText = 'Moves: 0';
    document.getElementById('timer').style.color = 'black'; // Reset timer color
    const puzzle = document.getElementById('puzzle');
    puzzle.innerHTML = '';
    tiles = [];
    emptyX = size - 1;
    emptyY = size - 1;
    console.log(`Empty tile position initialized at: (${emptyX}, ${emptyY})`);

    const fullImage = document.getElementById('full-image');
    const imagePath = `Images/${season}/${image}`;
    const encodedImage = encodeURI(imagePath);
    fullImage.src = encodedImage; // Use encoded URI
    fullImage.style.display = 'none';

    // Create tiles
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (x === emptyX && y === emptyY) {
                console.log(`Skipping empty tile at position: (${x}, ${y})`);
                continue; // Skip the empty tile
            }
            const tile = document.createElement('div');
            tile.classList.add('tile');

            // Calculate tile size and position
            const tileSize = 100 / size;
            tile.style.width = tile.style.height = `${tileSize}%`;
            tile.style.left = `${x * tileSize}%`;
            tile.style.top = `${y * tileSize}%`;

            // Use encoded URI for the image
            tile.style.backgroundImage = `url("${encodedImage}")`;

            // Set background size to cover the entire puzzle area
            tile.style.backgroundSize = `${size * 100}% ${size * 100}%`;

            // Corrected background position calculation
            tile.style.backgroundPosition = `-${x * 100}% -${y * 100}%`;

            // Store the original position for win checking
            tile.dataset.correctX = x;
            tile.dataset.correctY = y;

            // Set current position
            tile.dataset.x = x;
            tile.dataset.y = y;

            tile.addEventListener('click', moveTile);
            puzzle.appendChild(tile);
            tiles.push(tile);

            console.log(`Created tile at position: (${x}, ${y})`);
        }
    }

    shuffleTiles();
    startTimer();
    loadLeaderboard();
}

// Function to handle tile movement
function moveTile(e) {
    const tile = e.target;
    const tileX = parseInt(tile.dataset.x);
    const tileY = parseInt(tile.dataset.y);

    if ((tileX === emptyX && Math.abs(tileY - emptyY) === 1) || (tileY === emptyY && Math.abs(tileX - emptyX) === 1)) {
        swapTiles(tile);
        moveCount++; // Increment move counter
        document.getElementById('move-counter').innerText = `Moves: ${moveCount}`;
        console.log(`Moved tile to position: (${tile.dataset.x}, ${tile.dataset.y})`);
        if (checkWin()) {
            clearInterval(timerInterval);
            showWinMessage();
            saveScore(timeElapsed, moveCount);
            loadLeaderboard();
            revealFullImage();
        }
    }
}

// Function to swap a tile with the empty space
function swapTiles(tile) {
    const tempX = emptyX;
    const tempY = emptyY;
    emptyX = parseInt(tile.dataset.x);
    emptyY = parseInt(tile.dataset.y);
    tile.dataset.x = tempX;
    tile.dataset.y = tempY;
    tile.style.left = `${tempX * (100 / size)}%`;
    tile.style.top = `${tempY * (100 / size)}%`;
}

// Function to shuffle tiles
function shuffleTiles() {
    // Implement a shuffle algorithm
    for (let i = 0; i < 1000; i++) {
        const neighbors = getNeighbors(emptyX, emptyY);
        const randIndex = Math.floor(Math.random() * neighbors.length);
        const tile = neighbors[randIndex];
        swapTiles(tile);
    }
}

// Function to get neighboring tiles that can move into the empty space
function getNeighbors(x, y) {
    const neighbors = [];
    tiles.forEach(tile => {
        const tileX = parseInt(tile.dataset.x);
        const tileY = parseInt(tile.dataset.y);
        if ((tileX === x && Math.abs(tileY - y) === 1) || (tileY === y && Math.abs(tileX - x) === 1)) {
            neighbors.push(tile);
        }
    });
    return neighbors;
}

// Function to start the game timer
function startTimer() {
    timerInterval = setInterval(() => {
        timeElapsed += 0.01;
        document.getElementById('timer').innerText = `Time: ${formatTime(timeElapsed, false)}`;
    }, 10); // Update every 10 milliseconds
}

// Function to format time according to the specified format
function formatTime(timeInSeconds, includeHundredths) {
    let totalHundredths = Math.round(timeInSeconds * 100);
    let totalSeconds = Math.floor(totalHundredths / 100);
    let hundredths = totalHundredths % 100;

    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    let timeString = "";
    if (hours > 0) {
        timeString += hours + ":";
    }
    if (minutes > 0 || hours > 0) {
        timeString += minutes + ":";
    }
    if ((minutes > 0 || hours > 0) && seconds < 10) {
        timeString += "0";
    }
    timeString += seconds;

    if (includeHundredths) {
        timeString += "." + (hundredths < 10 ? "0" + hundredths : hundredths);
    }

    return timeString;
}

// Function to check if the puzzle is solved
function checkWin() {
    for (const tile of tiles) {
        const x = parseInt(tile.dataset.x);
        const y = parseInt(tile.dataset.y);
        const correctX = parseInt(tile.dataset.correctX);
        const correctY = parseInt(tile.dataset.correctY);
        if (x !== correctX || y !== correctY) {
            return false;
        }
    }
    // Check if empty space is in the bottom-right corner
    if (emptyX !== size - 1 || emptyY !== size - 1) {
        return false;
    }
    return true;
}

// Function to display the win message
function showWinMessage() {
    const timerElement = document.getElementById('timer');
    timerElement.innerText = `You won in ${formatTime(timeElapsed, true)}! Moves: ${moveCount}`;
    timerElement.style.color = 'green';
}

// Function to reveal the full image when the puzzle is solved
function revealFullImage() {
    const fullImage = document.getElementById('full-image');
    fullImage.style.display = 'block';

    // Fade out tiles
    tiles.forEach(tile => {
        tile.style.opacity = '0';
    });

    // Remove tiles after fade-out
    setTimeout(() => {
        const puzzle = document.getElementById('puzzle');
        puzzle.innerHTML = '';
    }, 1000); // Duration matches the CSS transition duration
}

// Function to load and display the leaderboard
function loadLeaderboard() {
    let scores = JSON.parse(localStorage.getItem(leaderboardKey)) || [];

    // Check for old leaderboard entries and convert them
    let updated = false;
    scores = scores.map(entry => {
        if (typeof entry === 'number') {
            // Old format detected, convert to new format
            updated = true;
            return { time: entry, moves: '-' }; // Use '-' as a placeholder for moves
        } else if (entry && typeof entry.time === 'number') {
            // Entry is already in the new format
            return entry;
        } else {
            // Handle any unexpected entries
            return { time: 0, moves: '-' };
        }
    });

    if (updated) {
        // Save the updated leaderboard back to localStorage
        localStorage.setItem(leaderboardKey, JSON.stringify(scores));
    }

    // Sort the scores by time
    scores.sort((a, b) => a.time - b.time);

    const table = document.getElementById('leaderboard-table');
    // Clear existing rows except the header
    table.innerHTML = `
        <tr>
            <th>Rank</th>
            <th>Time</th>
            <th>Moves</th>
        </tr>
    `;

    // Update the leaderboard title with the current puzzle size
    const leaderboardTitle = document.getElementById('leaderboard-title');
    leaderboardTitle.innerText = `Leaderboard ${size}x${size}`;

    scores.forEach((score, index) => {
        const row = table.insertRow();
        const rankCell = row.insertCell(0);
        const timeCell = row.insertCell(1);
        const movesCell = row.insertCell(2);
        rankCell.innerText = index + 1;
        timeCell.innerText = formatTime(score.time, true);
        movesCell.innerText = score.moves !== undefined ? score.moves : '-';
    });
}

// Function to save the player's score to the leaderboard
function saveScore(time, moves) {
    let scores = JSON.parse(localStorage.getItem(leaderboardKey)) || [];

    // Check for old leaderboard entries and convert them
    let updated = false;
    scores = scores.map(entry => {
        if (typeof entry === 'number') {
            // Old format detected, convert to new format
            updated = true;
            return { time: entry, moves: '-' };
        } else if (entry && typeof entry.time === 'number') {
            // Entry is already in the new format
            return entry;
        } else {
            // Handle any unexpected entries
            return { time: 0, moves: '-' };
        }
    });

    if (updated) {
        // Save the updated leaderboard back to localStorage
        localStorage.setItem(leaderboardKey, JSON.stringify(scores));
    }

    scores.push({ time: time, moves: moves });

    // Sort the scores by time
    scores.sort((a, b) => a.time - b.time);

    // Keep top 5 scores
    scores = scores.slice(0, 5);

    localStorage.setItem(leaderboardKey, JSON.stringify(scores));
}

// Function to adjust puzzle container size for browsers that don't support aspect-ratio
function adjustPuzzleContainerSize() {
    const puzzleContainer = document.getElementById('puzzle-container');
    const width = puzzleContainer.offsetWidth;
    puzzleContainer.style.height = `${width}px`;
}

// Call this function on window resize
window.addEventListener('resize', adjustPuzzleContainerSize);

// Call it when the page loads
adjustPuzzleContainerSize();

// Load the leaderboard when the page first loads
loadLeaderboard();

// Add an event listener for the reset button
document.getElementById('reset-leaderboard-button').addEventListener('click', resetLeaderboard);

// Function to reset the leaderboard
function resetLeaderboard() {
    // Show the confirmation modal
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = 'block';

    // Get the buttons
    const confirmBtn = document.getElementById('confirm-reset');
    const cancelBtn = document.getElementById('cancel-reset');

    // Add event listeners for the buttons
    confirmBtn.onclick = function () {
        // User confirmed reset
        modal.style.display = 'none';
        localStorage.removeItem(leaderboardKey);
        loadLeaderboard();
    };

    cancelBtn.onclick = function () {
        // User canceled reset
        modal.style.display = 'none';
    };

    // Close the modal when the user clicks outside of the modal content
    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}
