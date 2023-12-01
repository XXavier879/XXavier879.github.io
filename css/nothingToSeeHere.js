//nothing to see here just a mcpe command api
// Import the Minecraft server API
import * as Minecraft from "@minecraft/server";

// Define an object to hold registered commands
const registeredCommands = {};

// Function to register a command with its callback
function registerCommand(commandName, callbackFunc) {
  registeredCommands[commandName] = callbackFunc;
}

// Your specific functions for commands
function helpCommand(sender, args) {
  sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"Help command executed"}]}`);
}

// Register commands
registerCommand("help", helpCommand);
// Register more commands as needed using the same registerCommand function

// Listen to chat events
Minecraft.world.beforeEvents.chatSend.subscribe((data) => {
  const sender = data.sender;
  let message = data.message;

  // Define the prefix
  const prefix = "!";

  if (message.startsWith(prefix)) {
    data.cancel = true; // Cancel the chat message from being sent
    message = message.substring(prefix.length);

    // Iterate through registered commands
    for (const commandName in registeredCommands) {
      if (message.startsWith(commandName)) {
        const args = message.split(" ").slice(1);
        registeredCommands[commandName](sender, args); // Execute the command's callback function
        return;
      }
    }
  }
});
