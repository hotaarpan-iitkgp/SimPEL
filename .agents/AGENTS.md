# Dynamic Component Configurator Rules

Whenever the user requests the generation of any of the following three math blocks:
- `SUM_RECT` (Sum (rectangular))
- `SUM_ROUND` (Sum (round))
- `PRODUCT_RECT` (Product (rectangular))

**The agent must follow these rules:**
1. Do not directly generate a default 2-pin block.
2. Ask the user the configuration question first:
   - *"How many INPUT PINS do you need for this component? (e.g., 2, 3, 7, or 20?)"*
3. After the user responds:
   - Scale the component's body size (vertically/horizontally) to fit all pins with adequate spacing.
   - Display each pin's operation sign (+ / - / ×) next to it inside the block.
   - Place a single output pin on the right side.
   - Keep the 'CTRL' pin at the top-left as default if a rectangular block is chosen.
