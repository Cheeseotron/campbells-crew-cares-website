const crewEmailForm = document.querySelector("#crew-email-form");
const crewRecipient = document.querySelector("#crew-recipient");
const crewEmailAddress = document.querySelector("#crew-email-address");
const crewEmailButtonLabel = document.querySelector("#crew-email-button-label");

const crewRecipients = {
  campbell: {
    label: "Campbell",
    address: "campbell@campbellscrew.com"
  },
  carrie: {
    label: "Carrie",
    address: "carrie@campbellscrew.com"
  },
  shane: {
    label: "Shane",
    address: "shane@campbellscrew.com"
  },
  sage: {
    label: "Sage",
    address: "sage@campbellscrew.com"
  },
  all: {
    label: "the whole crew",
    address: "campbell@campbellscrew.com,carrie@campbellscrew.com,shane@campbellscrew.com,sage@campbellscrew.com"
  }
};

function updateCrewEmailPanel() {
  const selection = crewRecipients[crewRecipient.value];
  crewEmailAddress.textContent =
    crewRecipient.value === "all"
      ? "Campbell, Carrie, Shane & Sage"
      : selection.address;
  crewEmailButtonLabel.textContent = `Email ${selection.label}`;
}

crewRecipient.addEventListener("change", updateCrewEmailPanel);

crewEmailForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selection = crewRecipients[crewRecipient.value];
  window.location.href = `mailto:${selection.address}?subject=${encodeURIComponent("Campbell's Crew Cares inquiry")}`;
});

updateCrewEmailPanel();
