"""Container-side fixed test harness; reads generated code from stdin."""
import contextlib, io, json, sys

cases = [
    ('High balance', 2000, 0, False, 30, 0),
    ('Qualifying deposit', 400, 600, False, 30, 0),
    ('Student waiver', 400, 0, True, 21, 0),
    ('No waiver', 400, 0, False, 30, 12),
    ('Balance boundary', 1500, 0, False, 30, 0),
    ('Age boundary', 400, 0, True, 25, 12),
    ('Deposit boundary', 400, 500, False, 30, 0),
    ('Negative balance', -50, 100, False, 25, 'Rejected'),
]
source = sys.stdin.read(80001)
try:
    namespace = {'__name__': 'a2b_generated'}
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        exec(compile(source, '<generated>', 'exec'), namespace)
    fn = namespace.get('monthly_fee')
    if not callable(fn): raise ValueError('Expected a callable monthly_fee(balance, deposits, student, age).')
    results = []
    for name, balance, deposits, student, age, expected in cases:
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                actual = fn(balance, deposits, student, age)
            if isinstance(actual, bool) or not isinstance(actual, (int, float)):
                raise TypeError('Expected a numeric fee.')
            results.append({'name': name, 'expected': expected, 'actual': actual, 'passed': actual == expected})
        except Exception as exc:
            if expected == 'Rejected' and isinstance(exc, (ValueError, TypeError)):
                results.append({'name': name, 'expected': expected, 'actual': 'Rejected', 'passed': True})
            else:
                results.append({'name': name, 'expected': expected, 'actual': None, 'passed': False, 'error': str(exc)[:200]})
    print(json.dumps({'results': results}, allow_nan=False))
except Exception as exc:
    print(json.dumps({'error': str(exc)[:300]}))
