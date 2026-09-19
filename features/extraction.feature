Feature: Listing extraction

  Scenario: Portal-style listing text is parsed without guessing
    Given a listing page saying "3 Bedroom House for Sale in Observatory. Asking price R 3 500 000. 3 Bathrooms. 2 Parking. Erf Size 200 m². Rates and taxes R 1 318. Garden. Fibre."
    When I parse the listing
    Then the price is 3500000
    And the erf size is 200
    And the floor size is not found
    And the levy is not found
