function generateRaidHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

window.addEventListener('onWidgetLoad', function (obj) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+"; // Character pool for the scramble effect.
    const nameElement = document.querySelector("#raider-name");
    const countElement = document.querySelector("#raider-count");

    // These values come from StreamElements' data attributes, injected when the alert triggers.
    const finalMessage = nameElement.dataset.value;
    const raiderName = nameElement.dataset.name || "";
    const finalCount = parseInt(countElement.dataset.count);

    // Generate and display the RAID_HASH derived from the raider's name.
    document.querySelector("#raid-hash").innerText = generateRaidHash(raiderName);

    let nameIteration = 0;  // Tracks how many characters of the name have been 'decrypted'.
    let countIteration = 0; // Tracks the current value in the count-up animation.

    // 1. Name Decryption (Intro)
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

    // 2. Count Up Number (Intro)
    // Counts up quickly using steps scaled to the raider count, then kicks off the idle jitter.
    let countInterval = setInterval(() => {
        if (countIteration >= finalCount) {
            countElement.innerText = finalCount.toString().padStart(3, '0'); // Zero-pad to 3 digits (e.g. "042").
            clearInterval(countInterval);
            startJitter(); // Start the background glitching once finished
        } else {
            countIteration += Math.ceil(finalCount / 20); // Step size scales with total so it finishes in ~20 ticks.
            if (countIteration > finalCount) countIteration = finalCount;
            countElement.innerText = countIteration.toString().padStart(3, '0');
        }
    }, 40);

    // 3. The "Jitter" Effect (Idle Animation)
    // Runs forever after the intro finishes. Randomly corrupts the number for a brief flash.
    function startJitter() {
        setInterval(() => {
            // Only glitch 30% of the time to keep it from being annoying
            if (Math.random() > 0.7) {
                const originalValue = finalCount.toString().padStart(3, '0');

                // Briefly show random symbols instead of numbers
                countElement.innerText = "??";
                countElement.style.opacity = "0.5";

                setTimeout(() => {
                    countElement.innerText = originalValue;
                    countElement.style.opacity = "1";
                }, 150); // Flash back to normal after 150ms
            }
        }, 1500); // Check for a glitch every 1.5 seconds
    }
});