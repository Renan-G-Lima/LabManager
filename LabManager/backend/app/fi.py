fibo = int(input("digite um numero"))

x = 0
y = 1
l = []

while x <= fibo:
    x, y = y, x + y
    l.append(y)

print(l)

