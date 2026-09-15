document.addEventListener("DOMContentLoaded", () => {
  const password = document.querySelector("#password");
  const link = document.querySelector("#forgot-password-link");
  if (password && link) password.insertAdjacentElement("afterend", link);
});
