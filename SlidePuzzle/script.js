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
    leaderboardKey = `leaderboard_${size}x${size}`;
    loadLeaderboard();
}

// Function to start the game
function startGame() {
    size = parseInt(document.getElementById('size').value);
    leaderboardKey = `leaderboard_${size}x${size}`;
    const imageSelect = document.getElementById('image-select');
    image = imageSelect.value;
    initGame();
}

// Function to initialize the game
function initGame() {
    clearInterval(timerInterval);
    timeElapsed = 0;
    document.getElementById('timer').innerText = 'Time: 0s';
    document.getElementById('timer').style.color = 'black'; // Reset timer color
    const puzzle = document.getElementById('puzzle');
    puzzle.innerHTML = '';
    tiles = [];
    emptyX = size - 1;
    emptyY = size - 1;

    const fullImage = document.getElementById('full-image');
    const encodedImage = encodeURI(image);
    fullImage.src = encodedImage; // Use encoded URI

    fullImage.style.display = 'none';

    const puzzleContainer = document.getElementById('puzzle-container');
    const puzzleSize = puzzleContainer.offsetWidth; // Get the width of the container

    // Create tiles
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (x === emptyX && y === emptyY) continue; // Skip the empty tile
            const tile = document.createElement('div');
            tile.classList.add('tile');

            // Calculate tile size and position
            tile.style.width = tile.style.height = `${(100 / size)}%`;
            tile.style.left = `${(x * 100) / size}%`;
            tile.style.top = `${(y * 100) / size}%`;

            // Use encoded URI for the image
            tile.style.backgroundImage = `url("${encodedImage}")`;

            // Set background size to the total size of the puzzle
            tile.style.backgroundSize = `${size * 100}% ${size * 100}%`;

            // Set background position
            tile.style.backgroundPosition = `-${(x * 100) / (size - 1)}% -${(y * 100) / (size - 1)}%`;

            // Store the original position for win checking
            tile.dataset.correctX = x;
            tile.dataset.correctY = y;

            // Set current position
            tile.dataset.x = x;
            tile.dataset.y = y;

            tile.addEventListener('click', moveTile);
            puzzle.appendChild(tile);
            tiles.push(tile);
        }
    }

    shuffleTiles();
    startTimer();
    loadLeaderboard();
}

// ... rest of your existing code ...
