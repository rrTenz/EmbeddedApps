let size = 3;
let timerInterval;
let timeElapsed = 0;
let emptyX, emptyY;
let tiles = [];
let image;
let leaderboardKey;

document.getElementById('start-button').addEventListener('click', startGame);

function startGame() {
    size = parseInt(document.getElementById('size').value);
    const imageSelect = document.getElementById('image-select');
    image = imageSelect.value;
    initGame();
}

function initGame() {
    clearInterval(timerInterval);
    timeElapsed = 0;
    document.getElementById('timer').innerText = 'Time: 0s';
    document.getElementById('puzzle').innerHTML = '';
    document.getElementById('leaderboard-table').innerHTML = `
        <tr>
            <th>Rank</th>
            <th>Time (s)</th>
        </tr>
    `;
    tiles = [];
    emptyX = size - 1;
    emptyY = size - 1;
    leaderboardKey = `leaderboard_${size}x${size}`;

    const puzzle = document.getElementById('puzzle');
    const puzzleSize = 400;
    puzzle.style.width = puzzle.style.height = `${puzzleSize}px`;

    // Create tiles
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (x === emptyX && y === emptyY) continue; // Skip the empty tile
            const tile = document.createElement('div');
            tile.classList.add('tile');
            tile.style.width = tile.style.height = `${puzzleSize / size}px`;
            tile.style.left = `${(x * puzzleSize) / size}px`;
            tile.style.top = `${(y * puzzleSize) / size}px`;
            tile.style.backgroundImage = `url(${image})`;

            // Set background size to the size of the full puzzle
            tile.style.backgroundSize = `${puzzleSize}px ${puzzleSize}px`;

            // Set background position to show the correct portion of the image
            tile.style.backgroundPosition = `-${(x * puzzleSize) / size}px -${(y * puzzleSize) / size}px`;

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

function shuffleTiles() {
    // Implement a shuffle algorithm
    for (let i = 0; i < 1000; i++) {
        const neighbors = getNeighbors(emptyX, emptyY);
        const randIndex = Math.floor(Math.random() * neighbors.length);
        const tile = neighbors[randIndex];
        swapTiles(tile);
    }
}

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

function moveTile(e) {
    const tile = e.target;
    const tileX = parseInt(tile.dataset.x);
    const tileY = parseInt(tile.dataset.y);

    if ((tileX === emptyX && Math.abs(tileY - emptyY) === 1) || (tileY === emptyY && Math.abs(tileX - emptyX) === 1)) {
        swapTiles(tile);
        if (checkWin()) {
            clearInterval(timerInterval);
            alert(`Congratulations! You solved the puzzle in ${timeElapsed}s.`);
            saveTime(timeElapsed);
            loadLeaderboard();
        }
    }
}

function swapTiles(tile) {
    const tempX = emptyX;
    const tempY = emptyY;
    emptyX = parseInt(tile.dataset.x);
    emptyY = parseInt(tile.dataset.y);
    tile.dataset.x = tempX;
    tile.dataset.y = tempY;
    tile.style.left = `${(tempX * 400) / size}px`;
    tile.style.top = `${(tempY * 400) / size}px`;
}

function startTimer() {
    timerInterval = setInterval(() => {
        timeElapsed++;
        document.getElementById('timer').innerText = `Time: ${timeElapsed}s`;
    }, 1000);
}

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
    return true;
}

function saveTime(time) {
    let times = JSON.parse(localStorage.getItem(leaderboardKey)) || [];
    times.push(time);
    times.sort((a, b) => a - b);
    times = times.slice(0, 5); // Keep top 5 times
    localStorage.setItem(leaderboardKey, JSON.stringify(times));
}

function loadLeaderboard() {
    const times = JSON.parse(localStorage.getItem(leaderboardKey)) || [];
    const table = document.getElementById('leaderboard-table');
    times.forEach((time, index) => {
        const row = table.insertRow();
        const rankCell = row.insertCell(0);
        const timeCell = row.insertCell(1);
        rankCell.innerText = index + 1;
        timeCell.innerText = time;
    });
}
