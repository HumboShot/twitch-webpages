function generateAuthHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

window.addEventListener('onWidgetLoad', function (obj) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+"; // Character pool for the scramble effect.
    const nameElement = document.querySelector("#cheer-name");
    const countElement = document.querySelector("#cheer-count");

    // Guard against the widget loading before StreamElements injects the elements.
    if (!nameElement || !countElement) return;

    // These values come from StreamElements' data attributes, injected when the alert triggers.
    const finalMessage = nameElement.dataset.value;
    const cheerName = nameElement.dataset.name || "";
    const finalCount = parseInt(countElement.dataset.count) || 0;

    // Generate and display the AUTH_CODE derived from the cheerer's name.
    document.querySelector("#auth-hash").innerText = generateAuthHash(cheerName);

    let nameIteration = 0;  // Tracks how many characters of the name have been 'decrypted'.
    let countIteration = 0; // Tracks the current value in the count-up animation.

    // 1. Decrypt Name
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

    // 2. Roll Up Bits (Fast roll for big cheers)
    // Uses a larger step size than subs/resubs to keep even big cheer counts feeling punchy.
    let countInterval = setInterval(() => {
        if (countIteration >= finalCount) {
            countElement.innerText = finalCount.toString().padStart(3, '0'); // Zero-pad to 3 digits.
            clearInterval(countInterval);
        } else {
            // Accelerates the count for large amounts
            countIteration += Math.ceil(finalCount / 30); // Divides by 30 (vs 20 elsewhere) for faster roll.
            if (countIteration > finalCount) countIteration = finalCount;
            countElement.innerText = countIteration.toString().padStart(3, '0');
        }
    }, 40);
});