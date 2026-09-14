document.addEventListener("DOMContentLoaded", () => {
  const phone = document.querySelector('input[name="phone"]');
  if (!phone) return;
  phone.addEventListener("input", () => {
    const digits = phone.value.replace(/\D/g, "").slice(0, 10);
    if (digits.length < 4) phone.value = digits;
    else if (digits.length < 7) phone.value = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    else phone.value = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  });
});
