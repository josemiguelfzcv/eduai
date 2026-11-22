Statistics, Lecture 9: Conditional probability and Bayes' rule

Slide 1. Why condition?
Probabilities change when we learn something. Before you know anything, the chance that a randomly chosen student takes economics might be 40%. If you learn that the student is a statistics major, that chance can be very different. Conditioning means updating a probability using information we already have.

Slide 2. Definition
For events A and B with P(B) > 0, the conditional probability of A given B is P(A | B) = P(A and B) / P(B). Read it as: among the outcomes where B happened, what fraction also have A? Conditioning on B shrinks the sample space to B.

Slide 3. Example: a two-way table
In a class of 200 students, 80 take statistics, 60 take economics, and 30 take both. P(econ | stats) = 30 / 80 = 0.375, while P(stats | econ) = 30 / 60 = 0.5. The two conditional probabilities are not the same, and mixing them up is one of the most common mistakes in probability.

Slide 4. The multiplication rule
Rearranging the definition gives P(A and B) = P(A | B) P(B). This is how we compute the probability that several things all happen, one step at a time. Example: drawing two cards without replacement, P(both aces) = (4/52)(3/51).

Slide 5. Independence
A and B are independent when P(A | B) = P(A): learning B tells you nothing about A. Equivalently, P(A and B) = P(A) P(B). Independence is an assumption about the world, not something you can see in one outcome. Successive flips of a fair coin are independent, so a streak of heads does not make tails "due".

Slide 6. The law of total probability
If B1, B2, ..., Bk split the sample space into pieces, then P(A) = sum over i of P(A | Bi) P(Bi). Example: a factory has two machines. Machine 1 makes 70% of the parts with a 2% defect rate; machine 2 makes 30% with a 5% defect rate. The overall defect rate is 0.7 x 0.02 + 0.3 x 0.05 = 0.029.

Slide 7. Bayes' rule
Bayes' rule reverses a conditional probability: P(B | A) = P(A | B) P(B) / P(A), where P(A) usually comes from the law of total probability. Continuing the factory example, if a part is defective, the probability it came from machine 2 is 0.3 x 0.05 / 0.029, about 0.517.

Slide 8. Base rates
Medical tests are the classic application. Suppose a disease affects 1% of people, the test detects 95% of cases, and it wrongly flags 10% of healthy people. Then P(disease | positive) = 0.95 x 0.01 / (0.95 x 0.01 + 0.10 x 0.99), about 0.088. Most positive results are false positives, because healthy people vastly outnumber sick ones. Ignoring the base rate leads people to guess something close to 95%.

Slide 9. Summary
Conditional probability restricts attention to the cases where the condition holds. The multiplication rule builds joint probabilities step by step. Independence means conditioning changes nothing. The law of total probability adds up the pieces, and Bayes' rule turns a conditional probability around, with the base rate playing a decisive role.
