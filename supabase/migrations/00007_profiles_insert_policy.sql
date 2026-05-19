-- Allow users to create their own profile if the signup trigger did not run
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (id = auth.uid());
