function generateAuthHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

window.addEventListener('onWidgetLoad', function (obj) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+"; // Character pool for the scramble effect.
    const nameElement = document.querySelector("#gift-name");
    const totalGiftsElement = document.querySelector("#total-gifts");

    // These values come from StreamElements' data attributes, injected when the alert triggers.
    const finalMessage = nameElement.dataset.value;
    const gifterName = nameElement.dataset.name || "";
    const totalGifts = parseInt(totalGiftsElement.dataset.total) || 1;

    // Generate and display the AUTH_ID as sender hash x target hash.
    const targetName = document.querySelector(".data-block").dataset.target || "";
    document.querySelector("#auth-hash").innerText = generateAuthHash(gifterName) + "x" + generateAuthHash(targetName);

    let nameIteration = 0;   // Tracks how many characters of the name have been 'decrypted'.
    let totalIteration = 0;  // Tracks the current value in the count-up animation.

    // 1. Decrypt Gifter Name
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

    // 2. Roll up Total Recruiter Level at bottom left
    // Shows the gifter's all-time gift total counting up quickly.
    let totalInterval = setInterval(() => {
        if (totalIteration >= totalGifts) {
            totalGiftsElement.innerText = totalGifts.toString().padStart(3, '0'); // Zero-pad to 3 digits.
            clearInterval(totalInterval);
        } else {
            totalIteration += Math.ceil(totalGifts / 20); // Step size scales with total so it finishes in ~20 ticks.
            if (totalIteration > totalGifts) totalIteration = totalGifts;
            totalGiftsElement.innerText = totalIteration.toString().padStart(3, '0');
        }
    }, 40);
});