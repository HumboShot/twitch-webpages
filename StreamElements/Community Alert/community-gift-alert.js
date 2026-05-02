window.addEventListener('onWidgetLoad', function (obj) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+"; // Character pool for the scramble effect.
    const nameElement = document.querySelector("#sender-name");
    const countElement = document.querySelector("#gift-count");

    // These values come from StreamElements' data attributes, injected when the alert triggers.
    const finalMessage = nameElement.dataset.value;
    const finalCount = parseInt(countElement.dataset.count) || 1;

    let nameIteration = 0;  // Tracks how many characters of the name have been 'decrypted'.
    let countIteration = 0; // Tracks the current value in the count-up animation.

    // 1. Decrypt Sender Name
    // Rapidly replaces each character with random symbols until the real name is revealed left-to-right.
    let nameInterval = setInterval(() => {
        nameElement.innerText = finalMessage
            .split("")
            .map((letter, index) => {
                if (index < nameIteration) return finalMessage[index]; // Locked-in characters.
                return letters[Math.floor(Math.random() * 48)] // Still scrambled.
            })
            .join("");

        if (nameIteration >= finalMessage.length) clearInterval(nameInterval);
        nameIteration += 1 / 2; // Increment by 0.5 each tick for a smoother reveal.
    }, 30);

    // 2. Roll up the Gift Batch Count
    // Steps up quickly — larger gift batches use bigger steps so it always feels snappy.
    let countInterval = setInterval(() => {
        if (countIteration >= finalCount) {
            countElement.innerText = finalCount.toString().padStart(3, '0'); // Zero-pad to 3 digits.
            clearInterval(countInterval);
        } else {
            countIteration += Math.ceil(finalCount / 10); // Rolls up quickly for mass gifts
            if (countIteration > finalCount) countIteration = finalCount;
            countElement.innerText = countIteration.toString().padStart(3, '0');
        }
    }, 50);
});