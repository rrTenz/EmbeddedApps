// script.js

let size = 3; // Default puzzle size matching the default value in index.html
let timerInterval;
let timeElapsed = 0;
let emptyX, emptyY;
let tiles = [];
let image;
let leaderboardKey = `leaderboard_${size}x${size}`; // Initialize leaderboard key with default size

// Array of image filenames
const imageFilenames = [
    'Season 47 Logo.png',
    'Season 46 Logo.png',
    'Season 45 Logo.png',
    // Add more filenames as needed
];

// Function to format the filenames
function formatImageName(filename) {
    // Remove the directory path if present
    let name = filename.substring(filename.lastIndexOf('/') + 1);

    // Remove the file extension
    name = name.substring(0, name.lastIndexOf('.')) || name;

    // Replace underscores and hyphens with spaces
    name = name.replace(/[-_]/g, ' ');

    // Capitalize each word
    name = name.replace(/\b\w/g, char => char.toUpperCase());

    return name;
}

// Function to populate the image select dropdown
function populateImageSelect() {
    const imageSelect = document.getElementById('image-select');
    imageSelect.innerHTML = ''; // Clear existing options

    imageFilenames.forEach(filename => {
        const option = document.createElement('option');
        option.value = filename; // Use the exact filename, including spaces
        option.text = formatImageName(filename);
        imageSelect.appendChild(option);
    });
}

// Call the function to populate the dropdown when the page loads
populateImageSelect();

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
    initGame();
}

// Function to initialize the game
function initGame() {
    console.log(`Initializing game with size: ${size}`);
    clearInterval(timerInterval);
    timeElapsed = 0;
    document.getElementById('timer').innerText = 'Time: 0s';
    document.getElementById('timer').style.color = 'black'; // Reset timer color
    const puzzle = document.getElementById('puzzle');
    puzzle.innerHTML = '';
    tiles = [];
    emptyX = size - 1;
    emptyY = size - 1;
    console.log(`Empty tile position initialized at: (${emptyX}, ${emptyY})`);

    const fullImage = document.getElementById('full-image');
    const encodedImage = encodeURI(image);
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
        console.log(`Moved tile to position: (${tile.dataset.x}, ${tile.dataset.y})`);
        if (checkWin()) {
            clearInterval(timerInterval);
            showWinMessage();
            saveTime(timeElapsed);
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
        timeElapsed++;
        document.getElementById('timer').innerText = `Time: ${timeElapsed}s`;
    }, 1000);
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
    timerElement.innerText = `You won in ${timeElapsed} seconds!`;
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

// Function to save the player's time to the leaderboard
function saveTime(time) {
    let times = JSON.parse(localStorage.getItem(leaderboardKey)) || [];
    times.push(time);
    times.sort((a, b) => a - b);
    times = times.slice(0, 5); // Keep top 5 times
    localStorage.setItem(leaderboardKey, JSON.stringify(times));
}

// Function to load and display the leaderboard
function loadLeaderboard() {
    const times = JSON.parse(localStorage.getItem(leaderboardKey)) || [];
    const table = document.getElementById('leaderboard-table');
    // Clear existing rows except the header
    table.innerHTML = `
        <tr>
            <th>Rank</th>
            <th>Time (s)</th>
        </tr>
    `;

    // Update the leaderboard title with the current puzzle size
    const leaderboardTitle = document.getElementById('leaderboard-title');
    leaderboardTitle.innerText = `Leaderboard ${size}x${size}`;

    times.forEach((time, index) => {
        const row = table.insertRow();
        const rankCell = row.insertCell(0);
        const timeCell = row.insertCell(1);
        rankCell.innerText = index + 1;
        timeCell.innerText = time;
    });
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
