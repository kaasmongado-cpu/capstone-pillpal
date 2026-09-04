import { supabase } from "@pillpal/auth";

function App() {
  const testSupabase = async () => {
    const { data, error } = await supabase.auth.getSession();

    console.log("Session:", data.session);
    console.log("Error:", error);
  };

  return (
    <div>
      <h1>PILLPAL Admin</h1>

      <button onClick={testSupabase}>
        Test Supabase Connection
      </button>
    </div>
  );
}

export default App;