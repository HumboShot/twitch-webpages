function generateTxnHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

window.addEventListener('onWidgetLoad', function (obj) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+"; // Character pool for the scramble effect.
    const nameElement = document.querySelector("#don-name");
    const countElement = document.querySelector("#don-amount");

    // These values come from StreamElements' data attributes, injected when the alert triggers.
    const finalMessage = nameElement.dataset.value;
    const donorName = nameElement.dataset.name || "";
    const finalCount = parseFloat(countElement.dataset.count);

    // Generate and display the TXN_HASH derived from the donor's name.
    document.querySelector("#auth-hash").innerText = generateTxnHash(donorName);
    let currencySymbol = countElement.getAttribute('data-currency') || "$"; // Falls back to USD if not set.

    // --- TICKER & MESSAGE LOGIC ---
    // Shows the donor's message in a scrolling ticker. Falls back to a default if the message is empty.
    const messageItem = document.querySelector(".ticker-item");
    const fallbackMessage = document.querySelector("#msg-fallback");
    const messageText = messageItem.innerText.trim();

    // Check if the message is empty or missing
    if (!messageText || messageText === "") {
        messageItem.style.display = "none";
        fallbackMessage.style.display = "inline-block";
    } else {
        fallbackMessage.style.display = "none";
        messageItem.style.display = "inline-block";
    }

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

    // 2. Count Up Currency with Proper Formatting
    // Counts from 0 to the donation amount as a float, formatted to 2 decimal places.
    let countInterval = setInterval(() => {
        if (countIteration >= finalCount) {
            countElement.innerText = currencySymbol + finalCount.toFixed(2);
            clearInterval(countInterval);
            startJitter(); // Start idle corruption effect once the final value is reached.
        } else {
            countIteration += finalCount / 20; // Reaches the target in exactly 20 ticks.
            if (countIteration > finalCount) countIteration = finalCount;
            countElement.innerText = currencySymbol + countIteration.toFixed(2);
        }
    }, 40);

    // Randomly corrupts the displayed amount for a brief flash every ~2 seconds.
    // Gives the impression of an unstable data feed after the intro animation finishes.
    function startJitter() {
        setInterval(() => {
            if (Math.random() > 0.8) { // 20% chance of glitching each tick.
                const originalValue = currencySymbol + finalCount.toFixed(2);
                countElement.innerText = "??.??";
                setTimeout(() => { countElement.innerText = originalValue; }, 100);
            }
        }, 2000);
    }
});