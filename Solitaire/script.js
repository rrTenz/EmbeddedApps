const cardWidth = 73;  // Approximate width of each card on the sprite
const cardHeight = 98; // Approximate height of each card on the sprite

let deck = [];
let flipCount = 1;

window.onload = function () {
  showNewGameModal();
};

function showNewGameModal() {
  document.getElementById('new-game-modal').style.display = 'flex';
}

function startGame(flip) {
  flipCount = flip;
  document.getElementById('new-game-modal').style.display = 'none';
  initBoard();
}

function initBoard() {
  const board = document.getElementById('board');
  board.innerHTML = ''; // Clear the board
  
  // Create the deck (refer to card positions in the sprite)
  deck = createDeck();

  // Shuffle the deck
  shuffle(deck);

  // Place the cards on the board
  for (let i = 0; i < 7; i++) {
    let column = document.createElement('div');
    column.classList.add('column');
    
    // Create card elements and append to the column
    for (let j = 0; j <= i; j++) {
      const card = createCard(deck.pop());
      column.appendChild(card);
    }
    board.appendChild(column);
  }
}

function createDeck() {
  let suits = ['clubs', 'spades', 'hearts', 'diamonds'];
  let values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  let deck = [];

  // Loop through each suit and value to generate deck positions on the sprite
  suits.forEach((suit, suitIndex) => {
    values.forEach((value, valueIndex) => {
      deck.push({
        suit, 
        value, 
        spriteX: valueIndex * cardWidth, 
        spriteY: suitIndex * cardHeight
      });
    });
  });

  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createCard(card) {
  const cardElement = document.createElement('div');
  cardElement.classList.add('card');
  
  // Set card background using the sprite sheet
  cardElement.style.backgroundImage = 'url("images/cards.png")';
  cardElement.style.width = `${cardWidth}px`;
  cardElement.style.height = `${cardHeight}px`;

  // Use background-position to display the correct card from the sprite
  cardElement.style.backgroundPosition = `-${card.spriteX}px -${card.spriteY}px`;

  return cardElement;
}
